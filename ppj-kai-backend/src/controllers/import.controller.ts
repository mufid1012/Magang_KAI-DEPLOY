import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import prisma from '../config/database';

interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

// ─── Station lookup (same data as frontend STATIONS constant) ─────────────
const STATIONS: Record<string, { lat: number; lng: number }> = {
  'Sta. Maguwo': { lat: -7.785040, lng: 110.436899 },
  'Sta. Lempuyangan': { lat: -7.789961, lng: 110.375275 },
  'Sta. Yogyakarta': { lat: -7.788870, lng: 110.363213 },
  'Sta. Patukan': { lat: -7.790771, lng: 110.325332 },
  'Sta. Wojo': { lat: -7.862278, lng: 110.041092 },
  'Sta. Jenar': { lat: -7.802037, lng: 110.000797 },
  'Sta. Wates': { lat: -7.859248, lng: 110.158247 },
  'Sta. Brambanan': { lat: -7.756641, lng: 110.500415 },
  'Sta. Klaten': { lat: -7.712576, lng: 110.602980 },
  'Sta. Delanggu': { lat: -7.622398, lng: 110.706588 },
  'Sta. Solo Balapan': { lat: -7.557184, lng: 110.819394 },
  'Sta. Wonogiri': { lat: -7.815882, lng: 110.921733 },
  'Sta. Sumberlawang': { lat: -7.327810, lng: 110.863565 },
  'Sta. Palur': { lat: -7.568030, lng: 110.875387 },
  'Sta. Sragen': { lat: -7.429623, lng: 111.016701 },
};

const EXPECTED_HEADERS = ['No', 'NIPP Petugas', 'Stasiun Awal', 'Stasiun Akhir', 'Tanggal', 'Jam Mulai', 'Jam Selesai'];

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/tugas/template-excel — Download blank Excel template
// ─────────────────────────────────────────────────────────────────────────────

export const downloadExcelTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const wb = XLSX.utils.book_new();

    // Header row + 3 example rows
    const data = [
      EXPECTED_HEADERS,
      [1, 'KAI-1234', 'Sta. Yogyakarta', 'Sta. Lempuyangan', '2026-07-01', '08:00', '16:00'],
      [2, 'KAI-1234', 'Sta. Lempuyangan', 'Sta. Maguwo', '2026-07-02', '08:00', '16:00'],
      [3, '', '', '', '', '', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths for readability
    ws['!cols'] = [
      { wch: 5 },   // No
      { wch: 18 },  // NIPP
      { wch: 22 },  // Stasiun Awal
      { wch: 22 },  // Stasiun Akhir
      { wch: 14 },  // Tanggal
      { wch: 12 },  // Jam Mulai
      { wch: 12 },  // Jam Selesai
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Jadwal PPJ');

    // Add instructions sheet
    const instruksi = [
      ['PETUNJUK PENGISIAN TEMPLATE IMPORT JADWAL PPJ'],
      [''],
      ['1. Kolom "No" — Nomor urut (opsional, bisa dikosongkan)'],
      ['2. Kolom "NIPP Petugas" — NIPP petugas yang terdaftar di sistem'],
      ['3. Kolom "Stasiun Awal" — Nama stasiun awal sesuai daftar stasiun yang tersedia'],
      ['4. Kolom "Stasiun Akhir" — Nama stasiun akhir sesuai daftar stasiun yang tersedia'],
      ['5. Kolom "Tanggal" — Format YYYY-MM-DD (contoh: 2026-07-01)'],
      ['6. Kolom "Jam Mulai" — Format HH:MM (contoh: 08:00). Opsional.'],
      ['7. Kolom "Jam Selesai" — Format HH:MM (contoh: 16:00). Opsional.'],
      [''],
      ['DAFTAR STASIUN YANG TERSEDIA:'],
      ...Object.keys(STATIONS).map(name => [name]),
    ];
    const wsInstruksi = XLSX.utils.aoa_to_sheet(instruksi);
    wsInstruksi['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInstruksi, 'Petunjuk');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template_jadwal_ppj.xlsx');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Download template error:', error);
    return res.status(500).json({ success: false, message: 'Gagal membuat template' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/tugas/import-excel — Import Excel file → bulk create tugas
// ─────────────────────────────────────────────────────────────────────────────

export const importExcel = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'File tidak ditemukan' });
    }

    // Parse Excel
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'File Excel kosong' });
    }

    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: 'File Excel tidak memiliki data (minimal 1 baris header + 1 baris data)' });
    }

    // Validate headers
    const headers = rows[0].map((h: any) => String(h).trim());
    const missingHeaders = EXPECTED_HEADERS.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Header kolom tidak sesuai template. Kolom yang hilang: ${missingHeaders.join(', ')}`,
        expected: EXPECTED_HEADERS,
        received: headers,
      });
    }

    // Map column indices
    const colIdx = {
      nipp: headers.indexOf('NIPP Petugas'),
      stasiunAwal: headers.indexOf('Stasiun Awal'),
      stasiunAkhir: headers.indexOf('Stasiun Akhir'),
      tanggal: headers.indexOf('Tanggal'),
      jamMulai: headers.indexOf('Jam Mulai'),
      jamSelesai: headers.indexOf('Jam Selesai'),
    };

    // Get managed petugas NIPPs for validation
    const managedPetugas = await prisma.user.findMany({
      where: { role: 'ppj', managerId },
      select: { id: true, nipp: true },
    });
    const nippToId = new Map(managedPetugas.map(p => [p.nipp, p.id]));

    // Validate each data row
    const errors: { row: number; message: string }[] = [];
    const validEntries: {
      jalur: string;
      tanggal: Date;
      startPointLat: number;
      startPointLong: number;
      endPointLat: number;
      endPointLong: number;
      startPointName: string;
      endPointName: string;
      jamMulai: string | null;
      jamSelesai: string | null;
      assignedTo: number;
    }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1; // 1-indexed for user display

      // Skip empty rows
      const nipp = String(row[colIdx.nipp] || '').trim();
      const stasiunAwal = String(row[colIdx.stasiunAwal] || '').trim();
      const stasiunAkhir = String(row[colIdx.stasiunAkhir] || '').trim();
      const tanggalRaw = String(row[colIdx.tanggal] || '').trim();
      const jamMulai = String(row[colIdx.jamMulai] || '').trim();
      const jamSelesai = String(row[colIdx.jamSelesai] || '').trim();

      // Skip completely empty rows
      if (!nipp && !stasiunAwal && !stasiunAkhir && !tanggalRaw) continue;

      // Validate NIPP
      if (!nipp) {
        errors.push({ row: rowNum, message: 'NIPP Petugas kosong' });
        continue;
      }
      const petugasId = nippToId.get(nipp);
      if (!petugasId) {
        errors.push({ row: rowNum, message: `NIPP "${nipp}" tidak ditemukan atau bukan petugas kelolaan Anda` });
        continue;
      }

      // Validate stations
      if (!stasiunAwal) {
        errors.push({ row: rowNum, message: 'Stasiun Awal kosong' });
        continue;
      }
      if (!stasiunAkhir) {
        errors.push({ row: rowNum, message: 'Stasiun Akhir kosong' });
        continue;
      }
      const startStation = STATIONS[stasiunAwal];
      if (!startStation) {
        errors.push({ row: rowNum, message: `Stasiun Awal "${stasiunAwal}" tidak dikenali` });
        continue;
      }
      const endStation = STATIONS[stasiunAkhir];
      if (!endStation) {
        errors.push({ row: rowNum, message: `Stasiun Akhir "${stasiunAkhir}" tidak dikenali` });
        continue;
      }

      // Validate date
      if (!tanggalRaw) {
        errors.push({ row: rowNum, message: 'Tanggal kosong' });
        continue;
      }

      // Handle Excel serial date numbers
      let parsedDate: Date;
      if (typeof row[colIdx.tanggal] === 'number') {
        // Excel serial date number
        parsedDate = new Date(Math.round((row[colIdx.tanggal] - 25569) * 86400 * 1000));
      } else {
        parsedDate = new Date(tanggalRaw);
      }

      if (isNaN(parsedDate.getTime())) {
        errors.push({ row: rowNum, message: `Tanggal "${tanggalRaw}" tidak valid. Gunakan format YYYY-MM-DD` });
        continue;
      }

      validEntries.push({
        jalur: `${stasiunAwal} → ${stasiunAkhir}`,
        tanggal: parsedDate,
        startPointLat: startStation.lat,
        startPointLong: startStation.lng,
        endPointLat: endStation.lat,
        endPointLong: endStation.lng,
        startPointName: stasiunAwal,
        endPointName: stasiunAkhir,
        jamMulai: jamMulai || null,
        jamSelesai: jamSelesai || null,
        assignedTo: petugasId,
      });
    }

    if (validEntries.length === 0 && errors.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang ditemukan di file Excel' });
    }

    // Bulk create valid entries
    let created = 0;
    if (validEntries.length > 0) {
      const result = await prisma.tugasPpj.createMany({
        data: validEntries.map(e => ({
          ...e,
          status: 'pending',
        })),
      });
      created = result.count;
    }

    return res.status(201).json({
      success: true,
      message: `Berhasil import ${created} tugas${errors.length > 0 ? `, ${errors.length} baris bermasalah` : ''}`,
      data: {
        imported: created,
        errors: errors.length,
        errorDetails: errors,
      },
    });
  } catch (error) {
    console.error('Import Excel error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengimport file Excel' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/templates — List all templates for current admin
// ─────────────────────────────────────────────────────────────────────────────

export const getTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const templates = await prisma.templatePenugasan.findMany({
      where: { createdBy: userId },
      include: {
        items: {
          include: {},
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich items with petugas info
    const petugasIds = [...new Set(templates.flatMap(t => t.items.map(i => i.assignedTo)))];
    const petugasMap = new Map<number, { nama: string; nipp: string }>();
    if (petugasIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: petugasIds } },
        select: { id: true, nama: true, nipp: true },
      });
      users.forEach(u => petugasMap.set(u.id, { nama: u.nama, nipp: u.nipp }));
    }

    const enriched = templates.map(t => ({
      ...t,
      items: t.items.map(i => ({
        ...i,
        petugasNama: petugasMap.get(i.assignedTo)?.nama || '?',
        petugasNipp: petugasMap.get(i.assignedTo)?.nipp || '?',
      })),
    }));

    return res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Get templates error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/templates — Create new template
// ─────────────────────────────────────────────────────────────────────────────

export const createTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { nama, items } = req.body;

    if (!nama || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Nama dan minimal 1 item rute wajib diisi' });
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.assignedTo || !item.startPointName || !item.endPointName) {
        return res.status(400).json({ success: false, message: `Item ${i + 1}: Petugas, Stasiun Awal, dan Stasiun Akhir wajib diisi` });
      }
      // Validate stations
      if (!STATIONS[item.startPointName]) {
        return res.status(400).json({ success: false, message: `Item ${i + 1}: Stasiun Awal "${item.startPointName}" tidak dikenali` });
      }
      if (!STATIONS[item.endPointName]) {
        return res.status(400).json({ success: false, message: `Item ${i + 1}: Stasiun Akhir "${item.endPointName}" tidak dikenali` });
      }
      // Validate petugas is managed by this admin
      const petugas = await prisma.user.findFirst({
        where: { id: parseInt(item.assignedTo), managerId: userId },
      });
      if (!petugas) {
        return res.status(400).json({ success: false, message: `Item ${i + 1}: Petugas tidak ditemukan dalam daftar kelolaan Anda` });
      }
    }

    const template = await prisma.templatePenugasan.create({
      data: {
        nama,
        createdBy: userId,
        items: {
          create: items.map((item: any) => {
            const start = STATIONS[item.startPointName];
            const end = STATIONS[item.endPointName];
            return {
              assignedTo: parseInt(item.assignedTo),
              startPointName: item.startPointName,
              endPointName: item.endPointName,
              startPointLat: start.lat,
              startPointLong: start.lng,
              endPointLat: end.lat,
              endPointLong: end.lng,
              jamMulai: item.jamMulai || null,
              jamSelesai: item.jamSelesai || null,
            };
          }),
        },
      },
      include: { items: true },
    });

    return res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Create template error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admin/templates/:id — Delete template
// ─────────────────────────────────────────────────────────────────────────────

export const deleteTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const template = await prisma.templatePenugasan.findFirst({
      where: { id: parseInt(id), createdBy: userId },
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template tidak ditemukan' });
    }

    // Cascade delete (items auto-deleted via onDelete: Cascade)
    await prisma.templatePenugasan.delete({ where: { id: parseInt(id) } });

    return res.json({ success: true, message: 'Template berhasil dihapus' });
  } catch (error) {
    console.error('Delete template error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/templates/:id/apply — Apply template to a date range
// ─────────────────────────────────────────────────────────────────────────────

export const applyTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Tanggal awal dan akhir wajib diisi' });
    }

    const template = await prisma.templatePenugasan.findFirst({
      where: { id: parseInt(id), createdBy: userId },
      include: { items: true },
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template tidak ditemukan' });
    }

    if (template.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Template tidak memiliki item rute' });
    }

    // Generate dates in range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, message: 'Format tanggal tidak valid' });
    }
    if (start > end) {
      return res.status(400).json({ success: false, message: 'Tanggal awal harus sebelum tanggal akhir' });
    }

    // Max 31 days
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      return res.status(400).json({ success: false, message: 'Rentang tanggal maksimal 31 hari' });
    }

    const dates: Date[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    // Build tugas data: each template item × each date
    const tugasData = dates.flatMap(date =>
      template.items.map(item => ({
        jalur: `${item.startPointName} → ${item.endPointName}`,
        tanggal: date,
        startPointLat: item.startPointLat,
        startPointLong: item.startPointLong,
        endPointLat: item.endPointLat,
        endPointLong: item.endPointLong,
        startPointName: item.startPointName,
        endPointName: item.endPointName,
        jamMulai: item.jamMulai,
        jamSelesai: item.jamSelesai,
        assignedTo: item.assignedTo,
        status: 'pending',
      }))
    );

    const result = await prisma.tugasPpj.createMany({ data: tugasData });

    return res.status(201).json({
      success: true,
      message: `Berhasil generate ${result.count} tugas dari template "${template.nama}" untuk ${dates.length} hari`,
      data: { created: result.count, days: dates.length, itemsPerDay: template.items.length },
    });
  } catch (error) {
    console.error('Apply template error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
