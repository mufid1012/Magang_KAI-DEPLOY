import { parseAssignmentDate } from '../utils/assignmentValidation';
import type { Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import { getStationsForUser } from '../lib/accessScope';
import { ensureMapLocationsTable } from '../lib/mapLocationsTable';
import ExcelJS from 'exceljs';
import { STATIONS } from '../../../shared/stations';
import { findStationMatch, normalizeNipp, normalizeStationName, parseImportTime } from '../utils/importMatching';

function excelCellValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    if ('result' in value) return value.result;
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(part => part.text).join('');
    }
  }
  return value;
}

function worksheetRows(worksheet: ExcelJS.Worksheet): unknown[][] {
  if (worksheet.rowCount > 5_000 || worksheet.columnCount > 50) {
    throw new Error('EXCEL_LIMIT_EXCEEDED');
  }
  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: true }, row => {
    rows.push(Array.from(
      { length: worksheet.columnCount },
      (_, index) => excelCellValue(row.getCell(index + 1).value),
    ));
  });
  return rows;
}

type ImportInspectionPoint = {
  name: string;
  lat: number;
  lng: number;
  type: 'Stasiun' | 'Titik MAP';
};

async function getImportInspectionPoints(userId: number, role: string): Promise<ImportInspectionPoint[]> {
  const points: ImportInspectionPoint[] = STATIONS.map(station => ({ ...station, type: 'Stasiun' }));
  if (role !== 'admin') return points;

  await ensureMapLocationsTable();
  const customLocations = await prisma.mapLocation.findMany({
    where: { createdBy: userId },
    select: { name: true, latitude: true, longitude: true },
    orderBy: { name: 'asc' },
  });

  // Nama yang sama dengan stasiun/titik sebelumnya tidak ditambahkan ulang agar
  // pencocokan exact tidak menjadi ambigu. Stasiun bawaan mendapat prioritas.
  const knownNames = new Set(points.map(point => normalizeStationName(point.name)));
  for (const location of customLocations) {
    const normalizedName = normalizeStationName(location.name);
    if (!normalizedName || knownNames.has(normalizedName)) continue;
    knownNames.add(normalizedName);
    points.push({
      name: location.name,
      lat: location.latitude,
      lng: location.longitude,
      type: 'Titik MAP',
    });
  }

  return points;
}

export const downloadTugasTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const role = req.user!.role;

    // Template juga menampilkan petugas yang belum dikelola agar dapat langsung
    // dipakai untuk import; petugas tersebut otomatis dikaitkan saat import sukses.
    const petugasList = await prisma.user.findMany({
      where: {
        role: 'ppj',
        isActive: true,
        OR: [{ managerId }, { managerId: null }],
      },
      select: { nipp: true, nama: true },
      orderBy: { nama: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const inspectionPoints = await getImportInspectionPoints(managerId, role);

    // Sheet 1: Template with headers + example row
    const templateData = [
      ['NIPP Petugas', 'Nama Petugas', 'Titik Awal', 'Titik Akhir', 'Tanggal (YYYY-MM-DD)', 'Jam Mulai (HH:mm)', 'Jam Selesai (HH:mm)'],
      [petugasList[0]?.nipp || 'KAI-1234', petugasList[0]?.nama || 'Nama Petugas', 'Sta. Yogyakarta', 'Sta. Solo Balapan', '2026-07-10', '08:00', '16:00'],
    ];
    const wsTemplate = workbook.addWorksheet('Template Penugasan');
    wsTemplate.addRows(templateData);
    [18, 28, 22, 22, 22, 18, 18].forEach((width, index) => { wsTemplate.getColumn(index + 1).width = width; });

    // Sheet 2: all inspection points available to this importer
    const stationData = [
      ['Jenis', 'Nama Titik', 'Latitude', 'Longitude'],
      ...inspectionPoints.map(point => [point.type, point.name, point.lat, point.lng]),
    ];
    const wsStations = workbook.addWorksheet('Daftar Titik Pengecekan');
    wsStations.addRows(stationData);
    [14, 28, 14, 14].forEach((width, index) => { wsStations.getColumn(index + 1).width = width; });

    // Sheet 3: Daftar Petugas Kelolaan
    const petugasData = [
      ['NIPP', 'Nama'],
      ...petugasList.map(p => [p.nipp, p.nama]),
    ];
    const wsPetugas = workbook.addWorksheet('Daftar Petugas');
    wsPetugas.addRows(petugasData);
    [18, 30].forEach((width, index) => { wsPetugas.getColumn(index + 1).width = width; });

    // Generate buffer
    const buf = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template_penugasan_ppj.xlsx"');
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error('Download template error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const importTugasFromExcel = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const role = req.user!.role;

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'File Excel wajib diunggah' });
    }

    // Parse Excel from buffer (multer memoryStorage)
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      return res.status(400).json({ success: false, message: 'Gunakan file .xlsx dari template terbaru' });
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, message: 'File Excel kosong' });
    }
    const rows = worksheetRows(worksheet);

    // Skip header row
    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: 'File tidak memiliki data (hanya header)' });
    }

    // Petugas yang belum dikelola akan otomatis dikaitkan ke pengimpor ketika
    // baris pertamanya berhasil. Petugas milik manager lain tidak diambil alih.
    const activePetugas = await prisma.user.findMany({
      where: { role: 'ppj', isActive: true },
      select: { id: true, nipp: true, nama: true, managerId: true },
    });
    const nippMap = new Map(activePetugas.map(p => [normalizeNipp(p.nipp), p]));
    const inspectionPoints = await getImportInspectionPoints(managerId, role);

    // KUPT station validation
    let allowedStations: string[] | null = null;
    if (role === 'kupt') {
      allowedStations = await getStationsForUser(managerId, role);
    }

    const results: { row: number; status: 'success' | 'error'; message: string; jalur?: string }[] = [];
    let created = 0;

    // Process each data row (skip row 0 = header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1; // Human-readable row number (1-indexed, header = row 1)

      // Skip completely empty rows
      if (!row || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
        continue;
      }

      const rawNipp = String(row[0] || '').trim();
      // row[1] = Nama Petugas (read-only reference, skipped during import)
      const rawStart = String(row[2] || '').trim();
      const rawEnd = String(row[3] || '').trim();
      const rawTanggal = String(row[4] || '').trim();
      const rawJamMulai = row[5];
      const rawJamSelesai = row[6];

      // Validate required fields
      if (!rawNipp) {
        results.push({ row: rowNum, status: 'error', message: 'NIPP Petugas kosong' });
        continue;
      }
      if (!rawStart) {
        results.push({ row: rowNum, status: 'error', message: 'Titik Awal kosong' });
        continue;
      }
      if (!rawEnd) {
        results.push({ row: rowNum, status: 'error', message: 'Titik Akhir kosong' });
        continue;
      }
      if (!rawTanggal) {
        results.push({ row: rowNum, status: 'error', message: 'Tanggal kosong' });
        continue;
      }

      // Validate NIPP
      const petugas = nippMap.get(normalizeNipp(rawNipp));
      if (!petugas) {
        results.push({ row: rowNum, status: 'error', message: `NIPP "${rawNipp}" tidak ditemukan pada petugas PPJ aktif` });
        continue;
      }
      if (petugas.managerId !== null && petugas.managerId !== managerId) {
        results.push({ row: rowNum, status: 'error', message: `NIPP "${rawNipp}" sudah dikelola admin lain` });
        continue;
      }

      // Match built-in stations and the importing admin's registered MAP points.
      const startMatch = findStationMatch(rawStart, inspectionPoints);
      const endMatch = findStationMatch(rawEnd, inspectionPoints);
      if (!startMatch) {
        results.push({ row: rowNum, status: 'error', message: `Titik Awal "${rawStart}" tidak ditemukan` });
        continue;
      }
      if (!endMatch) {
        results.push({ row: rowNum, status: 'error', message: `Titik Akhir "${rawEnd}" tidak ditemukan` });
        continue;
      }
      const startStation = startMatch.station;
      const endStation = endMatch.station;
      if (startStation.name === endStation.name) {
        results.push({ row: rowNum, status: 'error', message: 'Titik Awal dan Akhir tidak boleh sama' });
        continue;
      }

      // KUPT: validate station within wilayah
      if (allowedStations) {
        if (!allowedStations.includes(startStation.name) || !allowedStations.includes(endStation.name)) {
          results.push({ row: rowNum, status: 'error', message: 'Stasiun di luar wilayah Anda' });
          continue;
        }
      }

      // Validate date
      const parsedDate = parseAssignmentDate(row[4]);
      if (!parsedDate) {
        results.push({ row: rowNum, status: 'error', message: `Tanggal "${rawTanggal}" tidak valid (gunakan format YYYY-MM-DD)` });
        continue;
      }

      // Jam yang diketik langsung di Excel biasanya dibaca sebagai angka pecahan
      // (contoh 08:00 = 0.333333), bukan string "08:00".
      const jamMulai = parseImportTime(rawJamMulai);
      const jamSelesai = parseImportTime(rawJamSelesai);
      if (!jamMulai.valid) {
        results.push({ row: rowNum, status: 'error', message: `Jam Mulai "${String(rawJamMulai)}" tidak valid (gunakan format HH:mm)` });
        continue;
      }
      if (!jamSelesai.valid) {
        results.push({ row: rowNum, status: 'error', message: `Jam Selesai "${String(rawJamSelesai)}" tidak valid (gunakan format HH:mm)` });
        continue;
      }

      // Build jalur name
      const jalur = `${startStation.name} → ${endStation.name}`;

      // Create tugas
      try {
        await prisma.$transaction(async tx => {
          if (petugas.managerId === null) {
            const claimed = await tx.user.updateMany({
              where: { id: petugas.id, managerId: null },
              data: { managerId },
            });
            if (claimed.count !== 1) throw new Error('PETUGAS_ALREADY_MANAGED');
          }

          await tx.tugasPpj.create({
            data: {
              jalur,
              tanggal: parsedDate,
              startPointLat: startStation.lat,
              startPointLong: startStation.lng,
              endPointLat: endStation.lat,
              endPointLong: endStation.lng,
              startPointName: startStation.name,
              endPointName: endStation.name,
              jamMulai: jamMulai.value,
              jamSelesai: jamSelesai.value,
              assignedTo: petugas.id,
              status: 'pending',
            },
          });
        });
        petugas.managerId = managerId;
        created++;
        const corrections = [
          startMatch.distance > 0 ? `"${rawStart}" → "${startStation.name}"` : null,
          endMatch.distance > 0 ? `"${rawEnd}" → "${endStation.name}"` : null,
        ].filter(Boolean);
        const correctionMessage = corrections.length > 0 ? `; typo dikenali: ${corrections.join(', ')}` : '';
        results.push({ row: rowNum, status: 'success', message: `Berhasil${correctionMessage}`, jalur });
      } catch (err: any) {
        const message = err.message === 'PETUGAS_ALREADY_MANAGED'
          ? `NIPP "${rawNipp}" baru saja dikelola admin lain`
          : `Gagal menyimpan: ${err.message}`;
        results.push({ row: rowNum, status: 'error', message });
      }
    }

    const errors = results.filter(r => r.status === 'error');
    return res.json({
      success: true,
      data: {
        total: results.length,
        created,
        failed: errors.length,
        details: results,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'EXCEL_LIMIT_EXCEEDED') {
      return res.status(400).json({ success: false, message: 'File Excel melebihi 5.000 baris atau 50 kolom' });
    }
    console.error('Import tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
