import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import * as XLSX from 'xlsx';

// Extend Request type to include user (set by auth middleware)
interface AuthRequest extends Request {
  user?: { id: number; role: string };
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

    const [tugasAktif, tugasSelesai, laporanDarurat] = await Promise.all([
      prisma.tugasPpj.count({ where: { status: { in: ['pending', 'in_progress'] }, ...tugasWhere } }),
      prisma.tugasPpj.count({ where: { status: 'completed', ...tugasWhere } }),
      prisma.laporan.count({
        where: {
          jenisTemuan: { in: ['emergency', 'berat'] },
          tracking: { tugas: tugasWhere },
        },
      }),
    ]);

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
        user: { select: { id: true, nama: true, nipp: true } },
        tracking: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          include: { laporan: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: tugas });
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
    const { jalur, tanggal, startPointLat, startPointLong, endPointLat, endPointLong, startPointName, endPointName, jamMulai, jamSelesai, assignedTo } = req.body;

    if (!jalur || !tanggal || !startPointLat || !startPointLong || !endPointLat || !endPointLong || !assignedTo) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    // KUPT: validate that station names are within their wilayah
    if (role === 'kupt') {
      const stations = await getStationsForUser(managerId, role);
      if (stations) {
        const startOk = !startPointName || stations.includes(startPointName);
        const endOk = !endPointName || stations.includes(endPointName);
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
        startPointLat: parseFloat(startPointLat),
        startPointLong: parseFloat(startPointLong),
        endPointLat: parseFloat(endPointLat),
        endPointLong: parseFloat(endPointLong),
        startPointName: startPointName || '',
        endPointName: endPointName || '',
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

    // Find all active tracking sessions (not stopped) with their tugas + user
    const activeTrackings = await prisma.tracking.findMany({
      where: {
        status: { not: 'stopped' },
        endLat: { not: null },
        endLong: { not: null },
        tugas: tugasFilter,
      },
      select: {
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
      .filter(t => t.endLat != null && t.endLong != null)
      .map(t => ({
        petugasNama: t.tugas.user.nama,
        petugasNipp: t.tugas.user.nipp,
        tugasId: t.tugas.id,
        jalur: t.tugas.jalur,
        latitude: t.endLat!,
        longitude: t.endLong!,
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
    const { nipp, nama, password, role, wilayahIds } = req.body;

    // Validate required fields
    if (!nipp || !nama || !password || !role) {
      return res.status(400).json({ success: false, message: 'NIPP, nama, password, dan role wajib diisi' });
    }

    // Validate role
    const validRoles = ['qc', 'kupt', 'ppj'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role harus: qc, kupt, atau ppj' });
    }

    // KUPT hanya boleh 1 wilayah
    if (role === 'kupt' && wilayahIds && wilayahIds.length > 1) {
      return res.status(400).json({ success: false, message: 'KUPT hanya boleh memiliki 1 wilayah' });
    }

    // Check if NIPP already exists
    const existing = await prisma.user.findUnique({ where: { nipp } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'NIPP sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        nipp,
        nama,
        password: hashedPassword,
        role,
        isActive: true,
      },
    });

    // Create wilayah assignments if provided (for QC/KUPT)
    if (wilayahIds && Array.isArray(wilayahIds) && wilayahIds.length > 0) {
      await prisma.userWilayah.createMany({
        data: wilayahIds.map((wId: number) => ({
          userId: user.id,
          wilayahId: wId,
        })),
      });
    }

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
    const { nama, role, wilayahIds, isActive, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Tidak boleh mengedit akun admin' });

    // Validate role if changing
    if (role) {
      const validRoles = ['qc', 'kupt', 'ppj'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Role harus: qc, kupt, atau ppj' });
      }
    }

    // KUPT: max 1 wilayah
    const effectiveRole = role || user.role;
    if (effectiveRole === 'kupt' && wilayahIds && wilayahIds.length > 1) {
      return res.status(400).json({ success: false, message: 'KUPT hanya boleh memiliki 1 wilayah' });
    }

    // Build update data
    const updateData: any = {};
    if (nama !== undefined) updateData.nama = nama;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    // Re-sync wilayah assignments if provided
    if (wilayahIds !== undefined) {
      // Delete existing assignments
      await prisma.userWilayah.deleteMany({ where: { userId: parseInt(id) } });

      // Create new assignments
      if (Array.isArray(wilayahIds) && wilayahIds.length > 0) {
        await prisma.userWilayah.createMany({
          data: wilayahIds.map((wId: number) => ({
            userId: parseInt(id),
            wilayahId: wId,
          })),
        });
      }
    }

    // Fetch updated user with wilayah
    const updatedUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
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

// DELETE /admin/users/:id — deactivate or delete user
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Tidak boleh menghapus akun admin' });

    // Soft delete — set isActive = false
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    return res.json({ success: true, message: 'Akun berhasil dinonaktifkan' });
  } catch (error) {
    console.error('Delete user error:', error);
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/tugas/template — Download Excel template for bulk task import
// ─────────────────────────────────────────────────────────────────────────────

export const downloadTugasTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;

    // Fetch petugas managed by this admin/kupt
    const petugasList = await prisma.user.findMany({
      where: { managerId, role: 'ppj', isActive: true },
      select: { nipp: true, nama: true },
      orderBy: { nama: 'asc' },
    });

    const wb = XLSX.utils.book_new();

    // Sheet 1: Template with headers + example row
    const templateData = [
      ['NIPP Petugas', 'Stasiun Awal', 'Stasiun Akhir', 'Tanggal (YYYY-MM-DD)', 'Jam Mulai (HH:mm)', 'Jam Selesai (HH:mm)'],
      [petugasList[0]?.nipp || 'KAI-1234', 'Sta. Yogyakarta', 'Sta. Solo Balapan', '2026-07-10', '08:00', '16:00'],
    ];
    const wsTemplate = XLSX.utils.aoa_to_sheet(templateData);
    // Set column widths
    wsTemplate['!cols'] = [
      { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template Penugasan');

    // Sheet 2: Daftar Stasiun
    const stationData = [
      ['Nama Stasiun', 'Latitude', 'Longitude'],
      ...STATIONS.map(s => [s.name, s.lat, s.lng]),
    ];
    const wsStations = XLSX.utils.aoa_to_sheet(stationData);
    wsStations['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsStations, 'Daftar Stasiun');

    // Sheet 3: Daftar Petugas Kelolaan
    const petugasData = [
      ['NIPP', 'Nama'],
      ...petugasList.map(p => [p.nipp, p.nama]),
    ];
    const wsPetugas = XLSX.utils.aoa_to_sheet(petugasData);
    wsPetugas['!cols'] = [{ wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsPetugas, 'Daftar Petugas');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

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
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'File Excel kosong' });
    }

    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Skip header row
    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: 'File tidak memiliki data (hanya header)' });
    }

    // Fetch managed petugas for validation
    const managedPetugas = await prisma.user.findMany({
      where: { managerId, role: 'ppj', isActive: true },
      select: { id: true, nipp: true, nama: true },
    });
    const nippMap = new Map(managedPetugas.map(p => [p.nipp.trim().toUpperCase(), p]));

    // KUPT station validation
    let allowedStations: string[] | null = null;
    if (role === 'kupt') {
      allowedStations = await getStationsForUser(managerId, role);
    }

    const stationMap = new Map(STATIONS.map(s => [s.name.trim().toLowerCase(), s]));

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
      const rawStart = String(row[1] || '').trim();
      const rawEnd = String(row[2] || '').trim();
      const rawTanggal = String(row[3] || '').trim();
      const rawJamMulai = String(row[4] || '').trim();
      const rawJamSelesai = String(row[5] || '').trim();

      // Validate required fields
      if (!rawNipp) {
        results.push({ row: rowNum, status: 'error', message: 'NIPP Petugas kosong' });
        continue;
      }
      if (!rawStart) {
        results.push({ row: rowNum, status: 'error', message: 'Stasiun Awal kosong' });
        continue;
      }
      if (!rawEnd) {
        results.push({ row: rowNum, status: 'error', message: 'Stasiun Akhir kosong' });
        continue;
      }
      if (!rawTanggal) {
        results.push({ row: rowNum, status: 'error', message: 'Tanggal kosong' });
        continue;
      }

      // Validate NIPP
      const petugas = nippMap.get(rawNipp.toUpperCase());
      if (!petugas) {
        results.push({ row: rowNum, status: 'error', message: `NIPP "${rawNipp}" tidak ditemukan di daftar petugas kelolaan Anda` });
        continue;
      }

      // Validate stations
      const startStation = stationMap.get(rawStart.toLowerCase());
      const endStation = stationMap.get(rawEnd.toLowerCase());
      if (!startStation) {
        results.push({ row: rowNum, status: 'error', message: `Stasiun Awal "${rawStart}" tidak ditemukan` });
        continue;
      }
      if (!endStation) {
        results.push({ row: rowNum, status: 'error', message: `Stasiun Akhir "${rawEnd}" tidak ditemukan` });
        continue;
      }
      if (startStation.name === endStation.name) {
        results.push({ row: rowNum, status: 'error', message: 'Stasiun Awal dan Akhir tidak boleh sama' });
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
      // Handle Excel serial date numbers
      if (typeof row[3] === 'number') {
        parsedDate = new Date(Math.round((row[3] - 25569) * 86400 * 1000));
      } else {
        parsedDate = new Date(rawTanggal);
      }
      if (isNaN(parsedDate.getTime())) {
        results.push({ row: rowNum, status: 'error', message: `Tanggal "${rawTanggal}" tidak valid (gunakan format YYYY-MM-DD)` });
        continue;
      }

      // Build jalur name
      const jalur = `${startStation.name} → ${endStation.name}`;

      // Create tugas
      try {
        await prisma.tugasPpj.create({
          data: {
            jalur,
            tanggal: parsedDate,
            startPointLat: startStation.lat,
            startPointLong: startStation.lng,
            endPointLat: endStation.lat,
            endPointLong: endStation.lng,
            startPointName: startStation.name,
            endPointName: endStation.name,
            jamMulai: rawJamMulai || null,
            jamSelesai: rawJamSelesai || null,
            assignedTo: petugas.id,
            status: 'pending',
          },
        });
        created++;
        results.push({ row: rowNum, status: 'success', message: 'Berhasil', jalur });
      } catch (err: any) {
        results.push({ row: rowNum, status: 'error', message: `Gagal menyimpan: ${err.message}` });
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
    console.error('Import tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
