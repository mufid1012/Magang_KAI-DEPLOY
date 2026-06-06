import { Request, Response } from 'express';
import prisma from '../config/database';

// Extend Request type to include user (set by auth middleware)
interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

// GET /admin/stats
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const [totalPetugas, tugasAktif, tugasSelesai, laporanDarurat] = await Promise.all([
      prisma.user.count({ where: { role: 'petugas', managerId: adminId } }),
      prisma.tugasPpj.count({ where: { status: { in: ['pending', 'in_progress'] }, user: { managerId: adminId } } }),
      prisma.tugasPpj.count({ where: { status: 'completed', user: { managerId: adminId } } }),
      prisma.laporan.count({ where: { jenisTemuan: { in: ['emergency', 'berat'] }, tracking: { tugas: { user: { managerId: adminId } } } } }),
    ]);
    return res.json({ success: true, data: { totalPetugas, tugasAktif, tugasSelesai, laporanDarurat } });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /admin/petugas
export const getAllPetugas = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const petugas = await prisma.user.findMany({
      where: { role: 'petugas', managerId: adminId },
      select: {
        id: true, nipp: true, nama: true, foto: true,
        tugasPpj: {
          where: { status: { in: ['pending', 'in_progress'] } },
          select: { id: true, jalur: true, status: true }
        }
      },
      orderBy: { nama: 'asc' },
    });
    return res.json({ success: true, data: petugas });
  } catch (error) {
    console.error('Get petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /admin/petugas/available
export const getAvailablePetugas = async (req: AuthRequest, res: Response) => {
  try {
    const petugas = await prisma.user.findMany({
      where: { role: 'petugas', managerId: null },
      select: { id: true, nipp: true, nama: true },
      orderBy: { nama: 'asc' }
    });
    return res.json({ success: true, data: petugas });
  } catch (error) {
    console.error('Get available petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /admin/petugas/add
export const addPetugasToManager = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const { nipps } = req.body; // Expecting an array of NIPPs
    
    if (!nipps || !Array.isArray(nipps) || nipps.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar NIPP wajib diisi' });
    }

    // Update all matching petugas that are currently available
    await prisma.user.updateMany({
      where: { 
        nipp: { in: nipps },
        role: 'petugas',
        managerId: null
      },
      data: { managerId: adminId }
    });

    return res.json({ success: true, message: 'Petugas berhasil ditambahkan ke daftar kelola Anda' });
  } catch (error) {
    console.error('Add petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /admin/petugas/remove
export const removePetugasFromManager = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const { id } = req.body;
    
    if (!id) return res.status(400).json({ success: false, message: 'ID Petugas wajib diisi' });

    // Ensure the petugas belongs to this manager
    const petugas = await prisma.user.findFirst({
      where: { id: parseInt(id), managerId: adminId }
    });
    
    if (!petugas) return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan dalam daftar Anda' });

    await prisma.user.update({
      where: { id: petugas.id },
      data: { managerId: null }
    });

    return res.json({ success: true, message: 'Petugas berhasil dihapus dari daftar kelola Anda' });
  } catch (error) {
    console.error('Remove petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /admin/tugas
export const getAllTugas = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const tugas = await prisma.tugasPpj.findMany({
      where: { user: { managerId: adminId } },
      include: {
        user: { select: { id: true, nama: true, nipp: true } },
        tracking: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { laporan: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: tugas });
  } catch (error) {
    console.error('Get all tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /admin/tugas
export const createTugas = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const { jalur, tanggal, startPointLat, startPointLong, endPointLat, endPointLong, startPointName, endPointName, jamMulai, jamSelesai, assignedTo } = req.body;

    if (!jalur || !tanggal || !startPointLat || !startPointLong || !endPointLat || !endPointLong || !assignedTo) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    // Ensure the assigned petugas actually belongs to this manager
    const petugasCheck = await prisma.user.findFirst({
      where: { id: parseInt(assignedTo), managerId: adminId }
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
      include: { user: { select: { nama: true, nipp: true } } }
    });

    return res.status(201).json({ success: true, data: tugas });
  } catch (error) {
    console.error('Create tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /admin/tugas/:id
export const deleteTugas = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const { id } = req.params;
    
    // Check if task belongs to a managed user
    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: parseInt(id), user: { managerId: adminId } }
    });
    
    if (!tugas) return res.status(403).json({ success: false, message: 'Tugas tidak ditemukan atau tidak diizinkan' });

    // Cascade delete: laporan → tracking → tugas (within a transaction)
    const tugasId = parseInt(id);
    await prisma.$transaction([
      // 1. Delete all laporan belonging to any tracking of this tugas
      prisma.laporan.deleteMany({ where: { tracking: { tugasId } } }),
      // 2. Delete all tracking sessions of this tugas
      prisma.tracking.deleteMany({ where: { tugasId } }),
      // 3. Delete the tugas itself
      prisma.tugasPpj.delete({ where: { id: tugasId } }),
    ]);
    return res.json({ success: true, message: 'Tugas dihapus' });
  } catch (error) {
    console.error('Delete tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /admin/emergency
export const getAllEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const laporan = await prisma.laporan.findMany({
      where: { tracking: { tugas: { user: { managerId: adminId } } } },
      orderBy: { createdAt: 'desc' },
      include: {
        tracking: {
          include: {
            tugas: {
              include: { user: { select: { nama: true, nipp: true } } }
            }
          }
        }
      }
    });
    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Get emergency error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
