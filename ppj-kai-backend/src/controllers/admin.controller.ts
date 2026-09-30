import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import ExcelJS from 'exceljs';
import { findStationMatch, normalizeNipp, normalizeStationName, parseImportTime } from '../utils/importMatching';
import { ensureMapLocationsTable } from '../lib/mapLocationsTable';
import { resolveTugasStatus } from '../utils/tugasStatus';

// Extend Request type to include user (set by auth middleware)
interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

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

function parseUniquePositiveIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is number => typeof item === 'number' && Number.isSafeInteger(item) && item > 0);
  if (ids.length !== value.length || new Set(ids).size !== ids.length) return null;
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Get station names for a user based on their wilayah assignments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns list of station names for QC/KUPT users, or null for admin (no filter).
 * Used to scope data visibility per role.
 */
async function getStationsForUser(userId: number, role: string): Promise<string[] | null> {
  if (role === 'admin') return null; // admin → no filter

  const assignments = await prisma.userWilayah.findMany({
    where: { userId },
    include: { wilayah: true },
  });

  const stations: string[] = [];
  for (const a of assignments) {
    try {
      const parsed = JSON.parse(a.wilayah.stations) as string[];
      stations.push(...parsed);
    } catch {
      // skip malformed JSON
    }
  }
  return stations;
}

/**
 * Build a Prisma "where" filter for tugas based on station names.
 * Matches startPointName or endPointName against the list.
 */
function buildStationFilter(stations: string[] | null) {
  if (!stations) return {}; // admin → no filter
  return {
    OR: [
      { startPointName: { in: stations } },
      { endPointName: { in: stations } },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/stats
// ─────────────────────────────────────────────────────────────────────────────

export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = await getStationsForUser(userId, role);

    // Admin: scoped by managerId. QC/KUPT: scoped by stations.
    const managedFilter = role === 'admin'
      ? { managerId: userId }
      : role === 'kupt'
        ? { managerId: userId }
        : {}; // QC doesn't own petugas, so count by station-based tugas

    // Count petugas
    let totalPetugas: number;
    if (role === 'qc') {
      // QC: count distinct petugas who have tugas in QC's stations
      const petugasInStations = await prisma.tugasPpj.findMany({
        where: buildStationFilter(stations),
        select: { assignedTo: true },
        distinct: ['assignedTo'],
      });
      totalPetugas = petugasInStations.length;
    } else {
      totalPetugas = await prisma.user.count({ where: { role: 'ppj', ...managedFilter } });
    }

    // Tugas filter
    const tugasWhere = role === 'qc'
      ? buildStationFilter(stations)
      : { user: managedFilter };

    const [tugasRows, laporanDarurat] = await Promise.all([
      prisma.tugasPpj.findMany({
        where: tugasWhere,
        select: {
          status: true,
          tracking: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, approvalStatus: true },
          },
        },
      }),
      prisma.laporan.count({
        where: {
          jenisTemuan: { in: ['emergency', 'berat'] },
          tracking: { tugas: tugasWhere },
        },
      }),
    ]);
    const effectiveStatuses = tugasRows.map(item => resolveTugasStatus(item.status, item.tracking));
    const tugasAktif = effectiveStatuses.filter(status => ['pending', 'in_progress', 'need_approval'].includes(status)).length;
    const tugasSelesai = effectiveStatuses.filter(status => status === 'completed').length;

    return res.json({ success: true, data: { totalPetugas, tugasAktif, tugasSelesai, laporanDarurat } });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/petugas
// ─────────────────────────────────────────────────────────────────────────────

export const getAllPetugas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = await getStationsForUser(userId, role);

    let petugas;

    if (role === 'qc') {
      // QC: read-only — get petugas who have tugas in QC's stations
      const petugasIds = await prisma.tugasPpj.findMany({
        where: buildStationFilter(stations),
        select: { assignedTo: true },
        distinct: ['assignedTo'],
      });
      const ids = petugasIds.map(p => p.assignedTo);

      petugas = await prisma.user.findMany({
        where: { id: { in: ids }, role: 'ppj' },
        select: {
          id: true, nipp: true, nama: true, foto: true,
          tugasPpj: {
            where: { status: { in: ['pending', 'in_progress'] } },
            select: { id: true, jalur: true, status: true },
          },
        },
        orderBy: { nama: 'asc' },
      });
    } else {
      // Admin / KUPT: scoped by managerId
      petugas = await prisma.user.findMany({
        where: { role: 'ppj', managerId: userId },
        select: {
          id: true, nipp: true, nama: true, foto: true,
          tugasPpj: {
            where: { status: { in: ['pending', 'in_progress'] } },
            select: { id: true, jalur: true, status: true },
          },
        },
        orderBy: { nama: 'asc' },
      });
    }

    return res.json({ success: true, data: petugas });
  } catch (error) {
    console.error('Get petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/petugas/available — Admin + KUPT only (QC → 403 via middleware)
// ─────────────────────────────────────────────────────────────────────────────

export const getAvailablePetugas = async (req: AuthRequest, res: Response) => {
  try {
    const petugas = await prisma.user.findMany({
      where: { role: 'ppj', managerId: null },
      select: { id: true, nipp: true, nama: true },
      orderBy: { nama: 'asc' },
    });
    return res.json({ success: true, data: petugas });
  } catch (error) {
    console.error('Get available petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/petugas/add — Admin + KUPT only
// ─────────────────────────────────────────────────────────────────────────────

export const addPetugasToManager = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const { nipps } = req.body;

    if (!nipps || !Array.isArray(nipps) || nipps.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar NIPP wajib diisi' });
    }

    await prisma.user.updateMany({
      where: {
        nipp: { in: nipps },
        role: 'ppj',
        managerId: null,
      },
      data: { managerId },
    });

    return res.json({ success: true, message: 'Petugas berhasil ditambahkan ke daftar kelola Anda' });
  } catch (error) {
    console.error('Add petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/petugas/remove — Admin + KUPT only
// ─────────────────────────────────────────────────────────────────────────────

export const removePetugasFromManager = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const { id } = req.body;

    if (!id) return res.status(400).json({ success: false, message: 'ID Petugas wajib diisi' });

    const petugas = await prisma.user.findFirst({
      where: { id: parseInt(id), managerId },
    });

    if (!petugas) return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan dalam daftar Anda' });

    await prisma.user.update({
      where: { id: petugas.id },
      data: { managerId: null },
    });

    return res.json({ success: true, message: 'Petugas berhasil dihapus dari daftar kelola Anda' });
  } catch (error) {
    console.error('Remove petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/tugas
// ─────────────────────────────────────────────────────────────────────────────

export const getAllTugas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = await getStationsForUser(userId, role);

    const whereClause = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    const tugas = await prisma.tugasPpj.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, nama: true, nipp: true, jabatan: true, division: true, workArea: true } },
        tracking: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          include: { laporan: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = tugas.map(item => ({
      ...item,
      status: resolveTugasStatus(item.status, item.tracking),
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get all tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/tugas — Admin + KUPT only
// ─────────────────────────────────────────────────────────────────────────────

export const createTugas = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const role = req.user!.role;
    const {
      jalur, tanggal, startPointLat, startPointLong, endPointLat, endPointLong,
      startPointName, endPointName, startMapLocationId, endMapLocationId,
      jamMulai, jamSelesai, assignedTo,
    } = req.body;

    if (!jalur || !tanggal || !startPointLat || !startPointLong || !endPointLat || !endPointLong || !assignedTo) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    let resolvedStart = {
      name: String(startPointName || ''),
      latitude: Number(startPointLat),
      longitude: Number(startPointLong),
    };
    let resolvedEnd = {
      name: String(endPointName || ''),
      latitude: Number(endPointLat),
      longitude: Number(endPointLong),
    };

    const requestedMapLocationIds = [startMapLocationId, endMapLocationId]
      .filter((value): value is string | number => value !== undefined && value !== null && value !== '')
      .map(value => Number(value));

    if (requestedMapLocationIds.length > 0) {
      if (role !== 'admin' || requestedMapLocationIds.some(id => !Number.isInteger(id))) {
        return res.status(400).json({ success: false, message: 'Titik MAP tidak valid' });
      }

      await ensureMapLocationsTable();
      const registeredLocations = await prisma.mapLocation.findMany({
        where: { id: { in: requestedMapLocationIds }, createdBy: managerId },
      });
      const locationById = new Map(registeredLocations.map(location => [location.id, location]));

      if (startMapLocationId) {
        const location = locationById.get(Number(startMapLocationId));
        if (!location) return res.status(400).json({ success: false, message: 'Titik MAP awal tidak ditemukan' });
        resolvedStart = { name: location.name, latitude: location.latitude, longitude: location.longitude };
      }
      if (endMapLocationId) {
        const location = locationById.get(Number(endMapLocationId));
        if (!location) return res.status(400).json({ success: false, message: 'Titik MAP akhir tidak ditemukan' });
        resolvedEnd = { name: location.name, latitude: location.latitude, longitude: location.longitude };
      }
    }

    if (
      ![resolvedStart.latitude, resolvedStart.longitude, resolvedEnd.latitude, resolvedEnd.longitude].every(Number.isFinite) ||
      Math.abs(resolvedStart.latitude) > 90 || Math.abs(resolvedEnd.latitude) > 90 ||
      Math.abs(resolvedStart.longitude) > 180 || Math.abs(resolvedEnd.longitude) > 180
    ) {
      return res.status(400).json({ success: false, message: 'Koordinat titik pengecekan tidak valid' });
    }

    // KUPT: validate that station names are within their wilayah
    if (role === 'kupt') {
      const stations = await getStationsForUser(managerId, role);
      if (stations) {
        const startOk = !resolvedStart.name || stations.includes(resolvedStart.name);
        const endOk = !resolvedEnd.name || stations.includes(resolvedEnd.name);
        if (!startOk || !endOk) {
          return res.status(403).json({ success: false, message: 'Stasiun di luar wilayah Anda' });
        }
      }
    }

    // Ensure the assigned petugas belongs to this manager
    const petugasCheck = await prisma.user.findFirst({
      where: { id: parseInt(assignedTo), managerId },
    });

    if (!petugasCheck) return res.status(403).json({ success: false, message: 'Petugas tidak ditemukan dalam daftar kelola Anda' });

    const tugas = await prisma.tugasPpj.create({
      data: {
        jalur,
        tanggal: new Date(tanggal),
        startPointLat: resolvedStart.latitude,
        startPointLong: resolvedStart.longitude,
        endPointLat: resolvedEnd.latitude,
        endPointLong: resolvedEnd.longitude,
        startPointName: resolvedStart.name,
        endPointName: resolvedEnd.name,
        jamMulai: jamMulai || null,
        jamSelesai: jamSelesai || null,
        assignedTo: parseInt(assignedTo),
        status: 'pending',
      },
      include: { user: { select: { nama: true, nipp: true } } },
    });

    return res.status(201).json({ success: true, data: tugas });
  } catch (error) {
    console.error('Create tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admin/tugas/:id — Admin + KUPT only
// ─────────────────────────────────────────────────────────────────────────────

export const deleteTugas = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const role = req.user!.role;
    const { id } = req.params;

    // Check if task belongs to a managed user
    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: parseInt(id), user: { managerId } },
    });

    if (!tugas) return res.status(403).json({ success: false, message: 'Tugas tidak ditemukan atau tidak diizinkan' });

    // KUPT: additionally validate task is within their wilayah
    if (role === 'kupt') {
      const stations = await getStationsForUser(managerId, role);
      if (stations) {
        const inWilayah = (tugas.startPointName && stations.includes(tugas.startPointName)) ||
                          (tugas.endPointName && stations.includes(tugas.endPointName));
        if (!inWilayah) {
          return res.status(403).json({ success: false, message: 'Tugas di luar wilayah Anda' });
        }
      }
    }

    // Cascade delete: laporan → tracking → tugas
    const tugasId = parseInt(id);
    await prisma.$transaction([
      prisma.laporan.deleteMany({ where: { tracking: { tugasId } } }),
      prisma.tracking.deleteMany({ where: { tugasId } }),
      prisma.tugasPpj.delete({ where: { id: tugasId } }),
    ]);
    return res.json({ success: true, message: 'Tugas dihapus' });
  } catch (error) {
    console.error('Delete tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/emergency
// ─────────────────────────────────────────────────────────────────────────────

export const getAllEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = await getStationsForUser(userId, role);

    const tugasFilter = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    const laporan = await prisma.laporan.findMany({
      where: { tracking: { tugas: tugasFilter } },
      orderBy: { createdAt: 'desc' },
      include: {
        tracking: {
          include: {
            tugas: {
              include: { user: { select: { nama: true, nipp: true } } },
            },
          },
        },
      },
    });
    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Get emergency error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/live-positions
// ─────────────────────────────────────────────────────────────────────────────

export const getLivePositions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = await getStationsForUser(userId, role);

    const tugasFilter = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    // Posisi live hanya berasal dari sesi tracking dan tugas yang masih aktif.
    const activeTrackings = await prisma.tracking.findMany({
      where: {
        status: 'started',
        tugas: { ...tugasFilter, status: 'in_progress' },
        OR: [
          { endLat: { not: null }, endLong: { not: null } },
          { startLat: { not: null }, startLong: { not: null } },
        ],
      },
      select: {
        startLat: true,
        startLong: true,
        endLat: true,
        endLong: true,
        updatedAt: true,
        tugas: {
          select: {
            id: true,
            jalur: true,
            user: { select: { nama: true, nipp: true } },
          },
        },
      },
    });

    const data = activeTrackings
      .filter(t => (t.endLat != null && t.endLong != null) || (t.startLat != null && t.startLong != null))
      .map(t => ({
        petugasNama: t.tugas.user.nama,
        petugasNipp: t.tugas.user.nipp,
        tugasId: t.tugas.id,
        jalur: t.tugas.jalur,
        latitude: t.endLat ?? t.startLat!,
        longitude: t.endLong ?? t.startLong!,
        updatedAt: t.updatedAt,
      }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get live positions error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// CRUD AKUN (Admin Only)
// ═════════════════════════════════════════════════════════════════════════════

// GET /admin/users — list semua user (QC, KUPT, PPJ) + wilayah info
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: 'admin' } },
      select: {
        id: true,
        nipp: true,
        nama: true,
        role: true,
        isActive: true,
        jabatan: true,
        division: true,
        workArea: true,
        phone: true,
        managerId: true,
        createdAt: true,
        wilayahAssignments: {
          include: { wilayah: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get all users error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /admin/users — create user baru (dengan role & wilayah)
export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { nipp, nama, password, role, wilayahIds, petugasIds } = req.body;

    // Validate required fields
    if (!nipp || !nama || !password || !role) {
      return res.status(400).json({ success: false, message: 'NIPP, nama, password, dan role wajib diisi' });
    }

    // Validate role
    const validRoles = ['qc', 'kupt', 'guest', 'ppj'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role harus: qc, kupt, guest, atau ppj' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 dan maksimal 128 karakter' });
    }

    const selectedWilayahIds = parseUniquePositiveIds(wilayahIds);
    if (role === 'kupt' && (!selectedWilayahIds || selectedWilayahIds.length < 2)) {
      return res.status(400).json({ success: false, message: 'KUPT wajib memiliki minimal 2 wilayah' });
    }
    if (wilayahIds !== undefined && !selectedWilayahIds) {
      return res.status(400).json({ success: false, message: 'Daftar wilayah tidak valid' });
    }
    if (selectedWilayahIds && selectedWilayahIds.length > 0) {
      const validWilayahCount = await prisma.wilayah.count({ where: { id: { in: selectedWilayahIds } } });
      if (validWilayahCount !== selectedWilayahIds.length) {
        return res.status(400).json({ success: false, message: 'Salah satu wilayah yang dipilih tidak valid' });
      }
    }

    const parsedPetugasIds = petugasIds === undefined ? [] : parseUniquePositiveIds(petugasIds);
    const selectedPetugasIds = role === 'kupt' && parsedPetugasIds ? parsedPetugasIds : [];
    if (!parsedPetugasIds) {
      return res.status(400).json({ success: false, message: 'Daftar petugas tidak valid' });
    }
    if (role !== 'kupt' && parsedPetugasIds.length > 0) {
      return res.status(400).json({ success: false, message: 'Petugas kelolaan hanya dapat dipilih untuk role KUPT' });
    }
    if (selectedPetugasIds.length > 0) {
      const validPetugasCount = await prisma.user.count({ where: { id: { in: selectedPetugasIds }, role: 'ppj' } });
      if (validPetugasCount !== selectedPetugasIds.length) {
        return res.status(400).json({ success: false, message: 'Salah satu petugas yang dipilih tidak valid' });
      }
    }

    // Check if NIPP already exists
    const existing = await prisma.user.findUnique({ where: { nipp } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'NIPP sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: { nipp, nama, password: hashedPassword, role, isActive: true },
      });

      if (selectedWilayahIds && selectedWilayahIds.length > 0) {
        await tx.userWilayah.createMany({
          data: selectedWilayahIds.map(wilayahId => ({ userId: created.id, wilayahId })),
        });
      }
      if (selectedPetugasIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: selectedPetugasIds }, role: 'ppj' },
          data: { managerId: created.id },
        });
      }
      return created;
    });

    // Fetch created user with wilayah
    const createdUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true, nipp: true, nama: true, role: true, isActive: true,
        wilayahAssignments: { include: { wilayah: true } },
      },
    });

    return res.status(201).json({ success: true, data: createdUser });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /admin/users/:id — update user (nama, role, wilayah, isActive)
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nama, role, wilayahIds, petugasIds, isActive, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Tidak boleh mengedit akun admin' });

    // Validate role if changing
    if (role) {
      const validRoles = ['qc', 'kupt', 'guest', 'ppj'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Role harus: qc, kupt, guest, atau ppj' });
      }
    }

    const effectiveRole = role || user.role;
    const selectedWilayahIds = wilayahIds === undefined ? undefined : parseUniquePositiveIds(wilayahIds);
    if (wilayahIds !== undefined && !selectedWilayahIds) {
      return res.status(400).json({ success: false, message: 'Daftar wilayah tidak valid' });
    }
    if (effectiveRole === 'kupt' && (role !== undefined || wilayahIds !== undefined)) {
      const effectiveWilayahCount = selectedWilayahIds
        ? selectedWilayahIds.length
        : await prisma.userWilayah.count({ where: { userId: user.id } });
      if (effectiveWilayahCount < 2) {
        return res.status(400).json({ success: false, message: 'KUPT wajib memiliki minimal 2 wilayah' });
      }
    }
    if (selectedWilayahIds && selectedWilayahIds.length > 0) {
      const validWilayahCount = await prisma.wilayah.count({ where: { id: { in: selectedWilayahIds } } });
      if (validWilayahCount !== selectedWilayahIds.length) {
        return res.status(400).json({ success: false, message: 'Salah satu wilayah yang dipilih tidak valid' });
      }
    }

    const shouldSyncPetugas = petugasIds !== undefined || (user.role === 'kupt' && effectiveRole !== 'kupt');
    const parsedPetugasIds = petugasIds === undefined ? [] : parseUniquePositiveIds(petugasIds);
    const selectedPetugasIds = effectiveRole === 'kupt' && parsedPetugasIds ? parsedPetugasIds : [];
    if (petugasIds !== undefined && !parsedPetugasIds) {
      return res.status(400).json({ success: false, message: 'Daftar petugas tidak valid' });
    }
    if (effectiveRole !== 'kupt' && parsedPetugasIds && parsedPetugasIds.length > 0) {
      return res.status(400).json({ success: false, message: 'Petugas kelolaan hanya dapat dipilih untuk role KUPT' });
    }
    if (selectedPetugasIds.length > 0) {
      const validPetugasCount = await prisma.user.count({ where: { id: { in: selectedPetugasIds }, role: 'ppj' } });
      if (validPetugasCount !== selectedPetugasIds.length) {
        return res.status(400).json({ success: false, message: 'Salah satu petugas yang dipilih tidak valid' });
      }
    }

    // Build update data
    const updateData: any = {};
    if (nama !== undefined) updateData.nama = nama;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        return res.status(400).json({ success: false, message: 'Password minimal 6 dan maksimal 128 karakter' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const userId = parseInt(id);
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: userId }, data: updateData });

      if (wilayahIds !== undefined) {
        await tx.userWilayah.deleteMany({ where: { userId } });
        if (selectedWilayahIds && selectedWilayahIds.length > 0) {
          await tx.userWilayah.createMany({
            data: selectedWilayahIds.map(wilayahId => ({ userId, wilayahId })),
          });
        }
      }

      if (shouldSyncPetugas) {
        await tx.user.updateMany({ where: { role: 'ppj', managerId: userId }, data: { managerId: null } });
        if (selectedPetugasIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: selectedPetugasIds }, role: 'ppj' },
            data: { managerId: userId },
          });
        }
      }
    });

    // Fetch updated user with wilayah
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, nipp: true, nama: true, role: true, isActive: true,
        wilayahAssignments: { include: { wilayah: true } },
      },
    });

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /admin/users/:id — permanent deletion with dependent data in one transaction
export const deleteUser = async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Hanya admin yang boleh menghapus akun' });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'ID akun tidak valid' });
  }
  // Older frontends used DELETE to deactivate. Never interpret those requests as permanent deletion.
  if (req.body?.confirmPermanent !== true) {
    return res.status(400).json({ success: false, message: 'Konfirmasi hapus permanen diperlukan. Muat ulang aplikasi; gunakan ubah status untuk menonaktifkan akun.' });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) return { status: 404, message: 'User tidak ditemukan' };
      if (user.role === 'admin' || id === req.user!.id) {
        return { status: 403, message: 'Tidak boleh menghapus akun admin atau akun sendiri' };
      }
      const activeTask = await tx.tugasPpj.findFirst({
        where: { assignedTo: id, OR: [{ status: 'in_progress' }, { tracking: { some: { status: 'started' } } }] },
        select: { id: true },
      });
      if (activeTask) return { status: 409, message: 'Akun masih menjalankan inspeksi. Selesaikan inspeksi sebelum menghapus akun.' };

      const trackings = await tx.tracking.findMany({ where: { tugas: { assignedTo: id } }, select: { id: true } });
      const trackingIds = trackings.map(tracking => tracking.id);
      // Recipient IDs and template assignees have no FK; clear them explicitly.
      await tx.warningAlert.updateMany({ where: { recipientOneTrackingId: { in: trackingIds } }, data: { recipientOneTrackingId: null } });
      await tx.warningAlert.updateMany({ where: { recipientTwoTrackingId: { in: trackingIds } }, data: { recipientTwoTrackingId: null } });
      await tx.laporan.deleteMany({ where: { trackingId: { in: trackingIds } } });
      await tx.tracking.deleteMany({ where: { tugas: { assignedTo: id } } });
      await tx.tugasPpj.deleteMany({ where: { assignedTo: id } });
      await tx.templateItem.deleteMany({ where: { OR: [{ assignedTo: id }, { template: { createdBy: id } }] } });
      await tx.templatePenugasan.deleteMany({ where: { createdBy: id } });
      await tx.userWilayah.deleteMany({ where: { userId: id } });
      await tx.warningAlert.deleteMany({ where: { createdBy: id } });
      await tx.mapLocation.deleteMany({ where: { createdBy: id } });
      await tx.trainSchedule.deleteMany({ where: { createdBy: id } });
      await tx.tracking.updateMany({ where: { approvedBy: id }, data: { approvedBy: null } });
      await tx.user.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await tx.user.delete({ where: { id } });
      return { status: 200, message: 'Akun berhasil dihapus permanen' };
    }, { isolationLevel: 'Serializable' });
    return res.status(result.status).json({ success: result.status === 200, message: result.message });
  } catch (error) {
    console.error('Delete user error:', error);
    const code = (error as { code?: string }).code;
    if (code === 'P2034' || code === 'P2003') {
      return res.status(409).json({ success: false, message: 'Data akun sedang digunakan atau berubah. Muat ulang dan coba lagi.' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /admin/wilayah — list semua wilayah (untuk dropdown di form create/edit user)
export const getAllWilayah = async (req: AuthRequest, res: Response) => {
  try {
    const wilayah = await prisma.wilayah.findMany({ orderBy: { kode: 'asc' } });
    return res.json({ success: true, data: wilayah });
  } catch (error) {
    console.error('Get wilayah error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Station Data (same as frontend STATIONS constant)
// ─────────────────────────────────────────────────────────────────────────────

const STATIONS = [
  { name: 'Sta. Maguwo', lat: -7.785040, lng: 110.436899 },
  { name: 'Sta. Lempuyangan', lat: -7.789961, lng: 110.375275 },
  { name: 'Sta. Yogyakarta', lat: -7.788870, lng: 110.363213 },
  { name: 'Sta. Patukan', lat: -7.790771, lng: 110.325332 },
  { name: 'Sta. Wojo', lat: -7.862278, lng: 110.041092 },
  { name: 'Sta. Jenar', lat: -7.802037, lng: 110.000797 },
  { name: 'Sta. Wates', lat: -7.859248, lng: 110.158247 },
  { name: 'Sta. Brambanan', lat: -7.756641, lng: 110.500415 },
  { name: 'Sta. Klaten', lat: -7.712576, lng: 110.602980 },
  { name: 'Sta. Delanggu', lat: -7.622398, lng: 110.706588 },
  { name: 'Sta. Solo Balapan', lat: -7.557184, lng: 110.819394 },
  { name: 'Sta. Wonogiri', lat: -7.815882, lng: 110.921733 },
  { name: 'Sta. Sumberlawang', lat: -7.327810, lng: 110.863565 },
  { name: 'Sta. Palur', lat: -7.568030, lng: 110.875387 },
  { name: 'Sta. Sragen', lat: -7.429623, lng: 111.016701 },
];

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/tugas/template — Download Excel template for bulk task import
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/tugas/import — Import tasks from uploaded Excel file
// ─────────────────────────────────────────────────────────────────────────────

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
      let parsedDate: Date;
      // Handle Excel serial date numbers (col index shifted due to Nama column)
      if (typeof row[4] === 'number') {
        parsedDate = new Date(Math.round((row[4] - 25569) * 86400 * 1000));
      } else {
        parsedDate = new Date(rawTanggal);
      }
      if (isNaN(parsedDate.getTime())) {
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

// ─────────────────────────────────────────────────────────────────────────────
// CRUD: KategoriTemuan — admin manages emergency categories
// ─────────────────────────────────────────────────────────────────────────────

export const getKategoriTemuan = async (_req: AuthRequest, res: Response) => {
  try {
    const data = await prisma.kategoriTemuan.findMany({ orderBy: { sortOrder: 'asc' } });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createKategoriTemuan = async (req: AuthRequest, res: Response) => {
  try {
    const { key, label, icon, color } = req.body;
    if (!key || !label || !icon) {
      return res.status(400).json({ success: false, message: 'Key, label, dan icon wajib diisi' });
    }

    // Check uniqueness
    const existing = await prisma.kategoriTemuan.findUnique({ where: { key } });
    if (existing) {
      return res.status(400).json({ success: false, message: `Key "${key}" sudah digunakan` });
    }

    // Auto sort order: next after max
    const maxSort = await prisma.kategoriTemuan.aggregate({ _max: { sortOrder: true } });
    const nextSort = (maxSort._max.sortOrder || 0) + 1;

    const created = await prisma.kategoriTemuan.create({
      data: { key, label, icon, color: color || 'primary', sortOrder: nextSort },
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Create kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateKategoriTemuan = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { label, icon, color, sortOrder } = req.body;

    const existing = await prisma.kategoriTemuan.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }

    const updated = await prisma.kategoriTemuan.update({
      where: { id: parseInt(id) },
      data: {
        ...(label !== undefined && { label }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Batch reorder: persist a new ordering in one atomic transaction
export const reorderKategoriTemuan = async (req: AuthRequest, res: Response) => {
  try {
    const { order } = req.body as { order?: number[] };

    if (!Array.isArray(order) || order.length === 0 || !order.every(id => Number.isInteger(id))) {
      return res.status(400).json({ success: false, message: 'Body harus berisi { order: number[] } dari id kategori' });
    }

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.kategoriTemuan.update({
          where: { id },
          data: { sortOrder: index + 1 },
        })
      )
    );

    const data = await prisma.kategoriTemuan.findMany({ orderBy: { sortOrder: 'asc' } });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Reorder kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteKategoriTemuan = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.kategoriTemuan.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }

    // Hard-delete: remove the row entirely. Laporan store jenisTemuan as a plain
    // string (no FK), and the frontend falls back to the raw key for old records.
    await prisma.kategoriTemuan.delete({ where: { id: parseInt(id) } });

    return res.json({ success: true, message: 'Kategori dihapus' });
  } catch (error) {
    console.error('Delete kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Public: active categories only (for petugas)
export const getActiveKategoriTemuan = async (_req: Request, res: Response) => {
  try {
    const data = await prisma.kategoriTemuan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get active kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
