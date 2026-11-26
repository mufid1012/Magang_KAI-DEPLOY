import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import prisma from '../config/database';
import { taskScope } from '../lib/accessScope';
import { haversineMeters } from '../../../shared/geo';
import { QC_THRESHOLDS, reviewFlags } from '../lib/qcReview';
import type { AuthRequest } from '../types/http';
import { resolveTugasStatus } from '../utils/tugasStatus';

const WIB_MS = 7 * 3600_000;
const PERIODS = new Set([1, 7, 30]);

/** Ringkasan mutu patroli untuk periode hari ini, 7, atau 30 hari (WIB), sesuai scope peran. */
export const getQcSummary = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await taskScope(req.user!.id, req.user!.role);
    if (!scope) return res.status(403).json({ success: false, message: 'Access denied' });
    const days = PERIODS.has(Number(req.query.days)) ? Number(req.query.days) : 7;
    const to = new Date(new Date(Date.now() + WIB_MS).toISOString().slice(0, 10) + 'T00:00:00Z');
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);

    const tugas = await prisma.tugasPpj.findMany({
      where: { ...scope, tanggal: { gte: from, lte: to } },
      orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
      select: {
        id: true, jalur: true, tanggal: true, status: true,
        startPointName: true, endPointName: true,
        startPointLat: true, startPointLong: true, endPointLat: true, endPointLong: true,
        user: { select: { id: true, nama: true, nipp: true } },
        tracking: {
          orderBy: { createdAt: 'desc' }, take: 1,
          select: {
            id: true, status: true, approvalStatus: true, durasi: true, startTime: true, endTime: true,
            endLat: true, endLong: true, earlyStopReason: true, forcedStopAt: true,
            _count: { select: { speedEvents: { where: { isTest: false } } } },
          },
        },
        _count: { select: { qcNotes: true } },
      },
    });

    // Celah GPS terpanjang per sesi selesai, dihitung di database agar sampel tidak dimuat satu per satu.
    const finished = tugas.flatMap(t => t.tracking[0]?.endTime ? [t.tracking[0]] : []);
    const gapRows = finished.length ? await prisma.$queryRaw<{ trackingId: number; longest: bigint | null; first: Date; last: Date }[]>`
      SELECT tracking_id AS trackingId, MAX(diff) AS longest, MIN(captured_at) AS first, MAX(captured_at) AS last
      FROM (
        SELECT tracking_id, captured_at,
          TIMESTAMPDIFF(SECOND, LAG(captured_at) OVER (PARTITION BY tracking_id ORDER BY captured_at), captured_at) AS diff
        FROM tracking_samples
        WHERE tracking_id IN (${Prisma.join(finished.map(t => t.id))}) AND quality <> 'before_start'
      ) samples
      GROUP BY tracking_id` : [];
    const gaps = new Map(gapRows.map(row => [Number(row.trackingId), row]));
    const longestGapSec = (t: (typeof finished)[number]) => {
      const startMs = (t.startTime ?? t.endTime!).getTime(), endMs = t.endTime!.getTime();
      const row = gaps.get(t.id);
      // Tanpa sampel sama sekali berarti seluruh sesi tidak punya jejak GPS.
      if (!row) return (endMs - startMs) / 1000;
      return Math.max(Number(row.longest ?? 0), (row.first.getTime() - startMs) / 1000, (endMs - row.last.getTime()) / 1000);
    };

    const counts: Record<string, number> = {};
    const petugas = new Map<number, { id: number; nama: string; nipp: string; total: number; terlaksana: number; missed: number; rejected: number; flagged: number; laporan: number }>();
    const flagged = [];
    for (const t of tugas) {
      const status = resolveTugasStatus(t.status, t.tracking);
      counts[status] = (counts[status] ?? 0) + 1;
      const p = petugas.get(t.user.id) ?? { ...t.user, total: 0, terlaksana: 0, missed: 0, rejected: 0, flagged: 0, laporan: 0 };
      petugas.set(t.user.id, p);
      p.total++;
      if (status === 'completed' || status === 'need_approval') p.terlaksana++;
      if (status === 'missed') p.missed++;
      if (status === 'rejected') p.rejected++;

      const tr = t.tracking[0];
      if (!tr?.endTime) continue;
      const flags = reviewFlags({
        start: { lat: t.startPointLat, lng: t.startPointLong }, end: { lat: t.endPointLat, lng: t.endPointLong },
        durasiSec: tr.durasi, stopLat: tr.endLat, stopLng: tr.endLong,
        earlyStopReason: tr.earlyStopReason, forcedStopAt: tr.forcedStopAt,
        speedEventCount: tr._count.speedEvents, longestGapSec: longestGapSec(tr),
      });
      if (!flags.length) continue;
      p.flagged++;
      flagged.push({
        tugasId: t.id, trackingId: tr.id, jalur: t.jalur, tanggal: t.tanggal, status, petugas: t.user,
        startPointName: t.startPointName, endPointName: t.endPointName,
        km: Math.round(haversineMeters(t.startPointLat, t.startPointLong, t.endPointLat, t.endPointLong) / 100) / 10,
        durasi: tr.durasi, flags, noteCount: t._count.qcNotes,
      });
    }

    const laporanScope = { tracking: { tugas: scope } };
    const overdueWhere = { ...laporanScope, handlingStatus: 'baru', createdAt: { lt: new Date(Date.now() - QC_THRESHOLDS.LAPORAN_OVERDUE_HOURS * 3600_000) } };
    const [laporan, overdueCount, overdue] = await Promise.all([
      prisma.laporan.findMany({
        where: { ...laporanScope, createdAt: { gte: new Date(from.getTime() - WIB_MS) } },
        select: { jenisTemuan: true, handlingStatus: true, tracking: { select: { tugas: { select: { assignedTo: true } } } } },
      }),
      prisma.laporan.count({ where: overdueWhere }),
      prisma.laporan.findMany({
        where: overdueWhere, orderBy: { createdAt: 'asc' }, take: 10,
        select: { id: true, jenisTemuan: true, createdAt: true, tracking: { select: { tugas: { select: { id: true, jalur: true, user: { select: { nama: true } } } } } } },
      }),
    ]);
    const byStatus: Record<string, number> = {};
    const byJenis: Record<string, number> = {};
    for (const l of laporan) {
      byStatus[l.handlingStatus] = (byStatus[l.handlingStatus] ?? 0) + 1;
      byJenis[l.jenisTemuan] = (byJenis[l.jenisTemuan] ?? 0) + 1;
      const p = petugas.get(l.tracking.tugas.assignedTo);
      if (p) p.laporan++;
    }

    const terlaksana = (counts.completed ?? 0) + (counts.need_approval ?? 0);
    const berakhir = terlaksana + (counts.missed ?? 0) + (counts.rejected ?? 0);
    return res.json({
      success: true,
      data: {
        period: { days, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
        thresholds: QC_THRESHOLDS,
        compliance: { total: tugas.length, counts, terlaksana, berakhir, rate: berakhir ? terlaksana / berakhir : null },
        flagged,
        petugas: [...petugas.values()].sort((a, b) => b.flagged - a.flagged || b.missed - a.missed || a.nama.localeCompare(b.nama)),
        laporan: {
          total: laporan.length, byStatus, byJenis, overdueCount,
          overdue: overdue.map(l => ({ id: l.id, jenisTemuan: l.jenisTemuan, createdAt: l.createdAt, tugasId: l.tracking.tugas.id, jalur: l.tracking.tugas.jalur, petugas: l.tracking.tugas.user.nama })),
        },
      },
    });
  } catch (error) {
    console.error('QC summary error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil ringkasan QC' });
  }
};

async function findScopedTask(req: AuthRequest) {
  const scope = await taskScope(req.user!.id, req.user!.role);
  if (!scope) return null;
  return prisma.tugasPpj.findFirst({ where: { id: Number(req.params.id), ...scope }, select: { id: true } });
}

const noteSelect = { id: true, note: true, createdAt: true, authorId: true, author: { select: { nama: true } } } as const;

export const getQcNotes = async (req: AuthRequest, res: Response) => {
  try {
    if (!await findScopedTask(req)) return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan' });
    const notes = await prisma.qcNote.findMany({ where: { tugasId: Number(req.params.id) }, orderBy: { createdAt: 'desc' }, select: noteSelect });
    return res.json({ success: true, data: notes });
  } catch (error) {
    console.error('QC notes error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil catatan QC' });
  }
};

export const createQcNote = async (req: AuthRequest, res: Response) => {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note || note.length > 500) return res.status(400).json({ success: false, message: 'Catatan wajib diisi, maksimal 500 karakter' });
    const task = await findScopedTask(req);
    if (!task) return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan' });
    const row = await prisma.qcNote.create({ data: { tugasId: task.id, authorId: req.user!.id, note }, select: noteSelect });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    console.error('Create QC note error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan catatan QC' });
  }
};

/** QC hanya dapat menghapus catatannya sendiri. */
export const deleteQcNote = async (req: AuthRequest, res: Response) => {
  try {
    const { count } = await prisma.qcNote.deleteMany({ where: { id: Number(req.params.id), authorId: req.user!.id } });
    if (!count) return res.status(404).json({ success: false, message: 'Catatan tidak ditemukan' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete QC note error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus catatan QC' });
  }
};
