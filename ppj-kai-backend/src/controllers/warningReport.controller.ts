import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import prisma from '../config/database';
import { getStationsForUser } from '../lib/accessScope';
import type { AuthRequest } from '../types/http';

const PERIODS = new Set([1, 7, 30]);
const MAX_ROWS = 500;

/**
 * Riwayat warning "Alert Kereta" antar PPJ. QC: warning pada stasiun wilayahnya.
 * Admin/KUPT: warning yang dikirim PPJ kelolaannya.
 */
export const getWarningReport = async (req: AuthRequest, res: Response) => {
  try {
    const { id: userId, role } = req.user!;
    const days = PERIODS.has(Number(req.query.days)) ? Number(req.query.days) : 7;
    let scope: Prisma.WarningAlertWhereInput;
    if (role === 'qc') {
      const stations = await getStationsForUser(userId, role) ?? [];
      scope = { OR: [{ startPointName: { in: stations } }, { endPointName: { in: stations } }] };
    } else if (role === 'admin' || role === 'kupt') {
      scope = { creator: { managerId: userId } };
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const rows = await prisma.warningAlert.findMany({
      where: { ...scope, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        id: true, createdAt: true, startPointName: true, endPointName: true, latitude: true, longitude: true,
        creator: { select: { nama: true, nipp: true } },
        tracking: { select: { tugas: { select: { jalur: true } } } },
        recipients: { orderBy: { id: 'asc' }, select: { tracking: { select: { tugas: { select: { user: { select: { nama: true, nipp: true } } } } } } } },
      },
    });

    const data = rows.map(row => ({
      id: row.id,
      createdAt: row.createdAt,
      startPointName: row.startPointName,
      endPointName: row.endPointName,
      latitude: row.latitude,
      longitude: row.longitude,
      creator: row.creator,
      jalur: row.tracking?.tugas.jalur ?? null,
      recipients: row.recipients.map(r => r.tracking.tugas.user),
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get warning report error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
