import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import bcrypt from 'bcryptjs';
import { countRunningTasks, countUnfinishedTasks } from '../lib/taskGuards';
import { audit } from '../lib/audit';

function parseUniquePositiveIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is number => typeof item === 'number' && Number.isSafeInteger(item) && item > 0);
  if (ids.length !== value.length || new Set(ids).size !== ids.length) return null;
  return ids;
}

const TAKEOVER_CONFLICT = 'Ada petugas terpilih yang masih dikelola pengelola lain dan memiliki tugas terjadwal, inspeksi berjalan, atau hasil yang menunggu approval. Selesaikan atau hapus tugas itu dulu.';

/** Selected PPJ that currently belong to a different manager (locked so a start cannot slip in). */
async function petugasOfOtherManagers(tx: Prisma.TransactionClient, petugasIds: number[], keepManagerId: number | null): Promise<number[]> {
  if (petugasIds.length === 0) return [];
  await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join(petugasIds)}) FOR UPDATE`;
  const rows = await tx.user.findMany({
    where: { id: { in: petugasIds }, NOT: { managerId: null }, ...(keepManagerId === null ? {} : { managerId: { not: keepManagerId } }) },
    select: { id: true },
  });
  return rows.map(row => row.id);
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

/**
 * `managerId` untuk akun PPJ: undefined = tidak diubah, null = tanpa pengelola,
 * angka = id admin/KUPT aktif. Role lain tidak boleh punya pengelola.
 */
async function resolveManagerId(raw: unknown, role: string): Promise<{ managerId: number | null | undefined } | { error: string }> {
  if (raw === undefined) return { managerId: undefined };
  if (role !== 'ppj') {
    return raw === null || raw === '' ? { managerId: undefined } : { error: 'Pengelola hanya dapat dipilih untuk akun PPJ' };
  }
  if (raw === null || raw === '') return { managerId: null };
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) return { error: 'Pengelola tidak valid' };
  const manager = await prisma.user.findFirst({ where: { id, role: { in: ['admin', 'kupt'] }, isActive: true }, select: { id: true } });
  if (!manager) return { error: 'Pengelola harus akun admin atau KUPT yang aktif' };
  return { managerId: id };
}

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { password, role, wilayahIds, petugasIds } = req.body;
    // Login trims NIPP, so a stored NIPP with surrounding spaces could never sign in.
    const nipp = typeof req.body.nipp === 'string' ? req.body.nipp.trim() : '';
    const nama = typeof req.body.nama === 'string' ? req.body.nama.trim() : '';

    // Validate required fields
    if (!nipp || !nama || !password || !role) {
      return res.status(400).json({ success: false, message: 'NIPP, nama, password, dan role wajib diisi' });
    }
    if (nipp.length > 20 || nama.length > 100) {
      return res.status(400).json({ success: false, message: 'NIPP maksimal 20 karakter dan nama maksimal 100 karakter' });
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

    // Pengelola PPJ boleh dipilih langsung saat membuat akun (admin atau KUPT aktif).
    const managerResult = await resolveManagerId(req.body.managerId, role);
    if ('error' in managerResult) return res.status(400).json({ success: false, message: managerResult.error });

    // Check if NIPP already exists
    const existing = await prisma.user.findUnique({ where: { nipp } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'NIPP sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async tx => {
      if (await countUnfinishedTasks(tx, await petugasOfOtherManagers(tx, selectedPetugasIds, null)) > 0) {
        throw new Error('PETUGAS_TAKEOVER_CONFLICT');
      }
      const created = await tx.user.create({
        data: { nipp, nama, password: hashedPassword, role, isActive: true, ...(managerResult.managerId !== undefined ? { managerId: managerResult.managerId } : {}) },
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
      await audit(tx, req.user!.id, 'user.create', 'user', created.id, { nipp, role, wilayahIds: selectedWilayahIds ?? [], petugasIds: selectedPetugasIds });
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
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(400).json({ success: false, message: 'NIPP sudah terdaftar' });
    }
    if (error instanceof Error && error.message === 'PETUGAS_TAKEOVER_CONFLICT') {
      return res.status(409).json({ success: false, message: TAKEOVER_CONFLICT });
    }
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
    if (nama !== undefined && (typeof nama !== 'string' || !nama.trim() || nama.trim().length > 100)) {
      return res.status(400).json({ success: false, message: 'Nama wajib diisi, maksimal 100 karakter' });
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Status aktif tidak valid' });
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
    const managerResult = await resolveManagerId(req.body.managerId, effectiveRole);
    if ('error' in managerResult) return res.status(400).json({ success: false, message: managerResult.error });
    const managerChange = managerResult.managerId !== undefined && managerResult.managerId !== user.managerId
      ? managerResult.managerId
      : undefined;

    // Build update data
    const updateData: any = {};
    if (managerChange !== undefined) updateData.managerId = managerChange;
    if (nama !== undefined) updateData.nama = nama.trim();
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        return res.status(400).json({ success: false, message: 'Password minimal 6 dan maksimal 128 karakter' });
      }
      updateData.password = await bcrypt.hash(password, 10);
      updateData.tokenVersion = { increment: 1 }; // sessions opened with the old password end
    }

    const userId = Number(id);
    const conflict = await prisma.$transaction(async tx => {
      // Lock the account and its PPJ before checking tasks; startTracking takes the same
      // user-row lock, so a start cannot slip between these checks and the write.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} OR manager_id = ${userId} FOR UPDATE`;
      // Pengelola PPJ tidak boleh diganti selama ada tugas yang masih butuh pengelola lamanya (AGENTS.md).
      if (managerChange !== undefined && await countUnfinishedTasks(tx, [userId]) > 0) {
        return 'Petugas masih memiliki tugas terjadwal, inspeksi berjalan, atau hasil yang menunggu approval. Selesaikan atau hapus tugas terjadwal sebelum mengganti pengelola.';
      }
      // A PPJ mid-inspection would be locked out with the task stuck in_progress.
      if (user.role === 'ppj' && (isActive === false || (role && role !== 'ppj')) && await countRunningTasks(tx, userId) > 0) {
        return 'Petugas sedang menjalankan inspeksi. Tunggu inspeksi selesai sebelum menonaktifkan atau mengganti role.';
      }
      const managedIds = (await tx.user.findMany({ where: { role: 'ppj', managerId: userId }, select: { id: true } })).map(petugas => petugas.id);
      // An inactive manager cannot log in, and nobody else may approve or force-stop its PPJ.
      if (isActive === false && await countUnfinishedTasks(tx, managedIds) > 0) {
        return 'Petugas kelolaan akun ini masih memiliki tugas terjadwal, inspeksi berjalan, atau hasil yang menunggu approval. Pindahkan petugas ke pengelola lain atau selesaikan dulu.';
      }
      // Released PPJ lose their manager; their open tasks would have no approver.
      if (shouldSyncPetugas && await countUnfinishedTasks(tx, managedIds.filter(petugasId => !selectedPetugasIds.includes(petugasId))) > 0) {
        return 'Ada petugas yang akan dilepas masih memiliki tugas terjadwal, inspeksi berjalan, atau hasil yang menunggu approval. Hapus tugas terjadwal atau selesaikan/approve dulu.';
      }
      // PPJ taken over from another manager: that manager's open tasks must not change approver.
      if (shouldSyncPetugas && await countUnfinishedTasks(tx, await petugasOfOtherManagers(tx, selectedPetugasIds, userId)) > 0) {
        return TAKEOVER_CONFLICT;
      }

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
      const { password: _password, tokenVersion: _tokenVersion, ...changed } = updateData;
      await audit(tx, req.user!.id, 'user.update', 'user', userId, {
        ...changed, ...(password ? { passwordReset: true } : {}),
        ...(wilayahIds !== undefined ? { wilayahIds: selectedWilayahIds ?? [] } : {}),
        ...(shouldSyncPetugas ? { petugasIds: selectedPetugasIds } : {}),
      });
      return null;
    });
    if (conflict) return res.status(409).json({ success: false, message: conflict });

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
      // Deleting a manager releases its PPJ; their unfinished tasks would have no approver.
      const managed = await tx.user.findMany({ where: { managerId: id, role: 'ppj' }, select: { id: true } });
      if (await countUnfinishedTasks(tx, managed.map(petugas => petugas.id)) > 0) {
        return { status: 409, message: 'Petugas kelolaan akun ini masih memiliki tugas terjadwal, inspeksi berjalan, atau hasil yang menunggu approval. Hapus tugas terjadwal atau selesaikan/approve dulu.' };
      }

      // Inspection records must outlive the account; deactivation keeps them and blocks login.
      if (await tx.tracking.count({ where: { tugas: { assignedTo: id } } }) > 0) {
        return { status: 409, message: 'Akun ini memiliki riwayat inspeksi. Nonaktifkan akun agar riwayat tetap tersimpan.' };
      }
      await tx.tugasPpj.deleteMany({ where: { assignedTo: id } });
      await tx.templateItem.deleteMany({ where: { OR: [{ assignedTo: id }, { template: { createdBy: id } }] } });
      await tx.templatePenugasan.deleteMany({ where: { createdBy: id } });
      await tx.userWilayah.deleteMany({ where: { userId: id } });
      await tx.warningAlert.deleteMany({ where: { createdBy: id } });
      await tx.mapLocation.deleteMany({ where: { createdBy: id } });
      await tx.trainSchedule.deleteMany({ where: { createdBy: id } });
      await tx.tracking.updateMany({ where: { approvedBy: id }, data: { approvedBy: null } });
      await tx.tracking.updateMany({ where: { forcedStopBy: id }, data: { forcedStopBy: null } });
      await tx.user.updateMany({ where: { managerId: id }, data: { managerId: null } });
      await audit(tx, req.user!.id, 'user.delete', 'user', id, { nipp: user.nipp, nama: user.nama, role: user.role });
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

/** Newest admin changes first; read-only and super admin only. */
export const getAuditLog = async (req: AuthRequest, res: Response) => {
  try {
    const before = req.query.before === undefined ? undefined : Number(req.query.before);
    if (before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) {
      return res.status(400).json({ success: false, message: 'Cursor tidak valid' });
    }
    const data = await prisma.adminAuditLog.findMany({
      where: before ? { id: { lt: before } } : {},
      orderBy: { id: 'desc' },
      take: 100,
      include: { actor: { select: { nama: true, nipp: true, role: true } } },
    });
    return res.json({ success: true, data, nextBefore: data.length === 100 ? data[99]!.id : null });
  } catch (error) {
    console.error('Get audit log error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil log audit' });
  }
};
