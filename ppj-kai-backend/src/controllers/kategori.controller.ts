import type { Request, Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';



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
    const key = typeof req.body.key === 'string' ? req.body.key.trim() : '';
    const { label, icon, color } = req.body;
    if (!key || key.length > 50 || typeof label !== 'string' || !label.trim() || label.length > 100 || typeof icon !== 'string' || !icon.trim() || icon.length > 50 || (color !== undefined && (typeof color !== 'string' || !color || color.length > 20))) {
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
    if ((label !== undefined && (typeof label !== 'string' || !label.trim() || label.length > 100)) || (icon !== undefined && (typeof icon !== 'string' || !icon.trim() || icon.length > 50)) || (color !== undefined && (typeof color !== 'string' || !color || color.length > 20)) || (sortOrder !== undefined && (!Number.isSafeInteger(sortOrder) || sortOrder < 0))) {
      return res.status(400).json({ success: false, message: 'Data kategori tidak valid' });
    }

    const existing = await prisma.kategoriTemuan.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }

    const updated = await prisma.kategoriTemuan.update({
      where: { id: Number(id) },
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

    const existing = await prisma.kategoriTemuan.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan' });
    }

    // Hard-delete: remove the row entirely. Laporan store jenisTemuan as a plain
    // string (no FK), and the frontend falls back to the raw key for old records.
    await prisma.kategoriTemuan.delete({ where: { id: Number(id) } });

    return res.json({ success: true, message: 'Kategori dihapus' });
  } catch (error) {
    console.error('Delete kategori temuan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

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
