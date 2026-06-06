import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';

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
