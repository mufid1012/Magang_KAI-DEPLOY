import { Request, Response, NextFunction } from 'express';
import { loadImage } from 'canvas';
import prisma from '../config/database';
import { ensureLoginPhotosTable } from '../lib/loginPhotosTable';

const metadata = { id: true, title: true, isActive: true, sortOrder: true, updatedAt: true } as const;
const orderBy = [{ sortOrder: 'asc' }, { id: 'asc' }] as const;
const withUrl = (photo: { id: number; updatedAt: Date }) => ({
  ...photo, url: `/login-photos/${photo.id}/image?v=${photo.updatedAt.getTime()}`,
});

function photoId(req: Request) {
  const value = String(req.params.id);
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function payload(req: Request) {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const sortOrder = Number(body.sortOrder ?? 0);
  if (!title || title.length > 150) throw new Error('Judul foto wajib diisi, maksimal 150 karakter');
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new Error('Urutan foto harus berupa angka 0–9999');
  if (body.isActive !== undefined && !['true', 'false', true, false].includes(body.isActive)) throw new Error('Status foto tidak valid');
  return { title, sortOrder, isActive: body.isActive === undefined ? true : String(body.isActive) === 'true' };
}

async function imagePayload(file?: Express.Multer.File) {
  if (!file) return {};
  const bytes = file.buffer;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!['image/png', 'image/jpeg'].includes(file.mimetype) || (!isPng && !isJpeg)) {
    throw new Error('Foto harus berupa file PNG atau JPG yang valid');
  }
  try {
    const decoded = await loadImage(bytes);
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 40_000_000) throw new Error();
  } catch {
    throw new Error('Foto rusak atau resolusinya terlalu besar (maksimal 40 megapiksel)');
  }
  return { image: bytes, mimeType: isPng ? 'image/png' : 'image/jpeg' };
}

export async function getPublicLoginPhotos(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureLoginPhotosTable();
    const photos = await prisma.loginPhoto.findMany({ where: { isActive: true }, select: metadata, orderBy: [...orderBy] });
    return res.set('Cache-Control', 'no-store').json({ success: true, data: photos.map(withUrl) });
  } catch (error) { next(error); }
}

export async function getLoginPhotos(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureLoginPhotosTable();
    const photos = await prisma.loginPhoto.findMany({ select: metadata, orderBy: [...orderBy] });
    return res.set('Cache-Control', 'no-store').json({ success: true, data: photos.map(withUrl) });
  } catch (error) { next(error); }
}

// Login pictures are public assets, including inactive pictures shown in admin previews.
export async function getLoginPhotoImage(req: Request, res: Response, next: NextFunction) {
  const id = photoId(req);
  if (!id) return res.status(400).json({ success: false, message: 'ID foto tidak valid' });
  try {
    await ensureLoginPhotosTable();
    const photo = await prisma.loginPhoto.findUnique({ where: { id }, select: { image: true, mimeType: true } });
    if (!photo) return res.status(404).json({ success: false, message: 'Foto tidak ditemukan' });
    return res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'cross-origin' }).send(photo.image);
  } catch (error) { next(error); }
}

export async function createLoginPhoto(req: Request, res: Response, next: NextFunction) {
  let data;
  try {
    if (!req.file) throw new Error('Pilih foto yang akan diunggah');
    data = { ...payload(req), ...await imagePayload(req.file) };
  } catch (error) { return res.status(400).json({ success: false, message: (error as Error).message }); }
  try {
    await ensureLoginPhotosTable();
    const photo = await prisma.loginPhoto.create({ data: { ...data, image: data.image!, mimeType: data.mimeType! }, select: metadata });
    return res.status(201).json({ success: true, data: withUrl(photo) });
  } catch (error) { next(error); }
}

export async function updateLoginPhoto(req: Request, res: Response, next: NextFunction) {
  const id = photoId(req);
  if (!id) return res.status(400).json({ success: false, message: 'ID foto tidak valid' });
  let data;
  try { data = { ...payload(req), ...await imagePayload(req.file) }; }
  catch (error) { return res.status(400).json({ success: false, message: (error as Error).message }); }
  try {
    await ensureLoginPhotosTable();
    const photo = await prisma.loginPhoto.update({ where: { id }, data, select: metadata });
    return res.json({ success: true, data: withUrl(photo) });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') return res.status(404).json({ success: false, message: 'Foto tidak ditemukan' });
    next(error);
  }
}

export async function deleteLoginPhoto(req: Request, res: Response, next: NextFunction) {
  const id = photoId(req);
  if (!id) return res.status(400).json({ success: false, message: 'ID foto tidak valid' });
  try {
    await ensureLoginPhotosTable();
    await prisma.loginPhoto.delete({ where: { id } });
    return res.json({ success: true, message: 'Foto login dihapus' });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') return res.status(404).json({ success: false, message: 'Foto tidak ditemukan' });
    next(error);
  }
}
