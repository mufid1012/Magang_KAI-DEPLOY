import { Request, Response } from 'express';
import prisma from '../config/database';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizePayload(body: any) {
  return {
    trainCode: String(body.trainCode || '').trim().toUpperCase(),
    trainName: String(body.trainName || '').trim(),
    origin: String(body.origin || '').trim(),
    destination: String(body.destination || '').trim(),
    departureTime: String(body.departureTime || '').trim(),
    arrivalTime: String(body.arrivalTime || '').trim(),
    // Boolean("false") is true; only real booleans are accepted (see validationMessage).
    isActive: body.isActive === undefined ? true : body.isActive,
  };
}

function validationMessage(payload: ReturnType<typeof normalizePayload>) {
  if (!payload.trainCode || !payload.trainName || !payload.origin || !payload.destination || !payload.departureTime || !payload.arrivalTime) {
    return 'Kode kereta, nama kereta, rute, jam berangkat, dan jam tiba wajib diisi';
  }
  if (payload.trainCode.length > 30 || payload.trainName.length > 100 || payload.origin.length > 150 || payload.destination.length > 150) {
    return 'Kode kereta maksimal 30, nama kereta 100, dan rute 150 karakter';
  }
  if (typeof payload.isActive !== 'boolean') return 'Status aktif tidak valid';
  if (!TIME_PATTERN.test(payload.departureTime) || !TIME_PATTERN.test(payload.arrivalTime)) {
    return 'Jam berangkat dan jam tiba harus menggunakan format HH:mm';
  }
  if (payload.origin.toLocaleLowerCase('id-ID') === payload.destination.toLocaleLowerCase('id-ID')) {
    return 'Rute awal dan destinasi akhir tidak boleh sama';
  }
  return null;
}

export const getTrainSchedules = async (_req: Request, res: Response) => {
  try {
    const data = await prisma.trainSchedule.findMany({ orderBy: [{ departureTime: 'asc' }, { trainCode: 'asc' }] });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get train schedules error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil jadwal kereta' });
  }
};

export const createTrainSchedule = async (req: Request, res: Response) => {
  try {
    const payload = normalizePayload(req.body);
    const errorMessage = validationMessage(payload);
    if (errorMessage) return res.status(400).json({ success: false, message: errorMessage });

    const data = await prisma.trainSchedule.create({
      data: { ...payload, createdBy: (req as any).user.id },
    });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ success: false, message: 'Kode kereta sudah digunakan' });
    console.error('Create train schedule error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menambah jadwal kereta' });
  }
};

export const updateTrainSchedule = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID jadwal tidak valid' });

    const existing = await prisma.trainSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Jadwal kereta tidak ditemukan' });

    const payload = normalizePayload({ ...existing, ...req.body });
    const errorMessage = validationMessage(payload);
    if (errorMessage) return res.status(400).json({ success: false, message: errorMessage });

    const data = await prisma.trainSchedule.update({ where: { id }, data: payload });
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ success: false, message: 'Kode kereta sudah digunakan' });
    console.error('Update train schedule error:', error);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui jadwal kereta' });
  }
};

export const deleteTrainSchedule = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID jadwal tidak valid' });
    const existing = await prisma.trainSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Jadwal kereta tidak ditemukan' });
    await prisma.trainSchedule.delete({ where: { id } });
    return res.json({ success: true, message: 'Jadwal kereta dihapus' });
  } catch (error) {
    console.error('Delete train schedule error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus jadwal kereta' });
  }
};

function minutesFromTime(value: string) {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWithinJourney(nowMinutes: number, departure: string, arrival: string) {
  const start = minutesFromTime(departure);
  const end = minutesFromTime(arrival);
  if (start <= end) return nowMinutes >= start && nowMinutes <= end;
  return nowMinutes >= start || nowMinutes <= end;
}

export const getCurrentTrainAlerts = async (_req: Request, res: Response) => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
    const nowMinutes = hour * 60 + minute;

    const schedules = await prisma.trainSchedule.findMany({
      where: { isActive: true },
      orderBy: { departureTime: 'asc' },
    });
    const data = schedules.filter(schedule => isWithinJourney(nowMinutes, schedule.departureTime, schedule.arrivalTime));
    return res.json({ success: true, data, currentTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` });
  } catch (error) {
    console.error('Get current train alerts error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil alert kereta' });
  }
};
