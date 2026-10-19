import type { Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import bcrypt from 'bcryptjs';

function parseUniquePositiveIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is number => typeof item === 'number' && Number.isSafeInteger(item) && item > 0);
  if (ids.length !== value.length || new Set(ids).size !== ids.length) return null;
  return ids;
}

export const getAllUsers = async (_req: AuthRequest, res: Response) => {
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

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nama, role, wilayahIds, petugasIds, isActive, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
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

    const userId = Number(id);
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
      // Warning recipients cascade when tracking is deleted; template assignees are cleared below.
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

export const getAllWilayah = async (_req: AuthRequest, res: Response) => {
  try {
    const wilayah = await prisma.wilayah.findMany({ orderBy: { kode: 'asc' } });
    return res.json({ success: true, data: wilayah });
  } catch (error) {
    console.error('Get wilayah error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
