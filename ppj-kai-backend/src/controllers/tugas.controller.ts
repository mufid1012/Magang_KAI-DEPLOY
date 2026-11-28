import fs from 'fs';
import path from 'path';
import { taskScope } from '../lib/accessScope';
import { categoryLookup, emergencyCategoryKeys } from '../lib/reportSeverity';
import { speedSummary, type SpeedState } from '../../../shared/telemetry';
import { Request, Response } from 'express';
import prisma from '../config/database';
import { renderStaticMap, type LatLng, type MapMarker } from '../lib/staticMap';
import { buildInspectionReport, distanceAlongRouteKm, REPORT_COLORS, reportRoute, type ReportFinding } from '../lib/inspectionReport';
import { resolveTugasStatus } from '../utils/tugasStatus';
import { loadGpsGaps } from '../lib/telemetry';

const PDF_FONTS = { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' };
let printer: any = null;
function pdfPrinter() {
  if (!printer) {
    printer = require('pdfmake');
    printer.fonts = { Helvetica: PDF_FONTS };
    // Report images are inline data URLs only; never let stored strings make the server fetch or read files.
    // The built-in font names pass through the same local-file check, so they are the only allowed "paths".
    const builtInFonts = new Set(Object.values(PDF_FONTS));
    printer.setUrlAccessPolicy(() => false);
    printer.setLocalAccessPolicy((file: string) => builtInFonts.has(file));
  }
  return printer;
}

let logoCache: string | null | undefined;
function reportLogo(): string | null {
  if (logoCache === undefined) {
    try {
      logoCache = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, '../../assets/logo-kai.png')).toString('base64')}`;
    } catch {
      logoCache = null; // letterhead falls back to text
    }
  }
  return logoCache;
}

async function reportMap(
  route: LatLng[],
  tracking: { status: string; routePath: string | null; startLat: number | null; startLong: number | null; endLat: number | null; endLong: number | null } | null,
  findings: ReportFinding[],
): Promise<{ image: string | null; note: string | null }> {
  if (!tracking) return { image: null, note: 'Peta tersedia setelah petugas memulai inspeksi.' };
  const markers: MapMarker[] = [];
  const start: LatLng | null = route[0] ?? (tracking.startLat !== null && tracking.startLong !== null ? [tracking.startLat, tracking.startLong] : null);
  if (start) markers.push({ lat: start[0], lng: start[1], label: 'A', color: REPORT_COLORS.navy });
  if (tracking.status !== 'started') {
    const end: LatLng | null = route.length ? route[route.length - 1]! : tracking.endLat !== null && tracking.endLong !== null ? [tracking.endLat, tracking.endLong] : null;
    if (end) markers.push({ lat: end[0], lng: end[1], label: 'B', color: REPORT_COLORS.navy });
  }
  for (const f of findings) markers.push({ lat: f.lat, lng: f.lng, label: String(f.no), color: f.emergency ? REPORT_COLORS.danger : REPORT_COLORS.accent });

  const notes: string[] = [];
  if (route.length < 2) {
    notes.push(tracking.status === 'started'
      ? 'Jejak GPS belum dikirim; jejak lengkap tersimpan saat petugas menyelesaikan inspeksi.'
      : 'Jejak GPS tidak terekam selama perjalanan (titik hanya dicatat bila akurasi GPS 20 m atau lebih baik), sehingga peta hanya menampilkan titik mulai, selesai, dan temuan.');
  }
  if (!markers.length) return { image: null, note: notes.join(' ') || null };

  const rendered = await renderStaticMap(route, markers);
  if (!rendered) {
    notes.push('Peta tidak dapat dibuat di server (modul canvas tidak tersedia atau gagal).');
    return { image: null, note: notes.join(' ') };
  }
  if (rendered.tilesLoaded === 0) notes.push('Latar peta OpenStreetMap tidak dapat dimuat saat laporan dibuat; jejak dan penanda tetap digambar.');
  else if (rendered.tilesLoaded < rendered.tilesTotal) notes.push('Sebagian latar peta OpenStreetMap gagal dimuat saat laporan dibuat.');
  return { image: rendered.dataUrl, note: notes.join(' ') || null };
}

export const getTugasPetugas = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const tugas = await prisma.tugasPpj.findMany({
      where: { assignedTo: userId },
      orderBy: { tanggal: 'desc' },
      include: {
        tracking: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          // The list only needs status and duration. Photos (up to 7 MB each), the route
          // (up to 20,000 points) and telemetry come from GET /tugas/:id when opened.
          select: {
            id: true, startTime: true, endTime: true, durasi: true, status: true,
            approvalStatus: true, safetyStatus: true, approvedAt: true, forcedStopAt: true, rejectionReason: true, earlyStopReason: true,
          },
        },
      },
    });

    const data = tugas.map(item => ({
      ...item,
      status: resolveTugasStatus(item.status, item.tracking),
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get Tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getTugasById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: Number(id), assignedTo: userId },
      include: {
        tracking: {
          orderBy: { createdAt: 'desc' },
          include: {
            laporan: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!tugas) {
      return res.status(404).json({ success: false, message: 'Tugas not found' });
    }

    return res.json({
      success: true,
      data: { ...tugas, status: resolveTugasStatus(tugas.status, tugas.tracking) },
    });
  } catch (error) {
    console.error('Get Tugas by ID error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getTugasSummary = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get all tasks for this user
    const tugas = await prisma.tugasPpj.findMany({
      where: {
        assignedTo: userId,
      },
      select: {
        status: true,
        tracking: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, approvalStatus: true },
        },
      },
    });
    const effectiveStatuses = tugas.map(item => resolveTugasStatus(item.status, item.tracking));

    // Mocking emergency reports count for the prototype
    const emergencyReports = await prisma.laporan.count({
      where: {
        tracking: {
          tugas: {
            assignedTo: userId
          }
        },
        jenisTemuan: { in: await emergencyCategoryKeys() }
      }
    });

    const summary = {
      totalTasks: tugas.length,
      completed: effectiveStatuses.filter(status => status === 'completed').length,
      needApproval: effectiveStatuses.filter(status => status === 'need_approval').length,
      inProgress: effectiveStatuses.filter(status => status === 'in_progress').length,
      pending: effectiveStatuses.filter(status => status === 'pending').length,
      emergencyReports: emergencyReports || 0
    };

    return res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Get Summary error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const downloadTugasReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requester = (req as any).user as { id: number; role: string };
    const tugasId = Number(id);

    const scope = await taskScope(requester.id, requester.role);
    if (!scope) return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke laporan tugas' });
    const accessFilter = { id: tugasId, ...scope };

    // Ambil data tugas beserta tracking & laporan
    const tugas = await prisma.tugasPpj.findFirst({
      where: accessFilter,
      include: {
        user: {
          select: { nama: true, nipp: true, jabatan: true, division: true, workArea: true },
        },
        tracking: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            laporan: { orderBy: { createdAt: 'asc' } },
            approver: { select: { nama: true, nipp: true } },
            forcedStopper: { select: { nama: true, nipp: true } },
            rejecter: { select: { nama: true, nipp: true } },
            speedEvents: { orderBy: { startAt: 'asc' }, select: { startAt: true, durationMs: true, maxKmh: true, meanKmh: true } },
            _count: { select: { telemetrySamples: true } },
          },
        },
      },
    });

    if (!tugas) {
      return res.status(404).json({ success: false, message: 'Tugas not found' });
    }

    const latestTracking = tugas.tracking[0] || null;

    // PPJ hanya boleh mengunduh hasil perjalanan setelah admin menyetujuinya.
    // Admin/KUPT/QC tetap dapat membuka draft laporan untuk kebutuhan review.
    if (requester.role === 'ppj' && latestTracking?.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        code: 'REPORT_NOT_APPROVED',
        message: 'Laporan belum disetujui admin. PDF dapat diunduh setelah approval.',
      });
    }

    const route = latestTracking ? reportRoute(latestTracking) : [];
    const category = await categoryLookup();
    const findings: ReportFinding[] = (latestTracking?.laporan ?? []).map((lap, i) => {
      const info = category(lap.jenisTemuan);
      return {
        no: i + 1,
        label: info.label,
        emergency: info.emergency,
        createdAt: lap.createdAt,
        lat: lap.latitude,
        lng: lap.longitude,
        deskripsi: lap.deskripsi,
        foto: lap.foto,
        kmFromStart: distanceAlongRouteKm(route, lap.latitude, lap.longitude),
      };
    });

    const map = await reportMap(route, latestTracking, findings);
    const telemetry = latestTracking
      ? speedSummary(latestTracking.telemetryState as SpeedState | null, Date.now(), latestTracking.telemetryTest, latestTracking.telemetryLoss)
      : null;
    const point = (lat: number | null, lng: number | null) => (lat !== null && lng !== null ? { lat, lng } : null);

    const docDefinition = buildInspectionReport({
      id: tugas.id,
      jalur: tugas.jalur,
      tanggal: tugas.tanggal,
      jamMulai: tugas.jamMulai,
      jamSelesai: tugas.jamSelesai,
      startPoint: { name: tugas.startPointName, lat: tugas.startPointLat, lng: tugas.startPointLong },
      endPoint: { name: tugas.endPointName, lat: tugas.endPointLat, lng: tugas.endPointLong },
      petugas: { nama: tugas.user.nama, nipp: tugas.user.nipp, jabatan: tugas.user.jabatan, unit: tugas.user.workArea || tugas.user.division },
      tracking: latestTracking && {
        status: latestTracking.status,
        startTime: latestTracking.startTime,
        endTime: latestTracking.endTime,
        durasi: latestTracking.durasi,
        start: point(latestTracking.startLat, latestTracking.startLong),
        end: point(latestTracking.endLat, latestTracking.endLong),
        fotoAwal: latestTracking.fotoAwal,
        fotoSelesai: latestTracking.fotoSelesai,
        approved: latestTracking.approvalStatus === 'approved',
        approvedAt: latestTracking.approvedAt,
        approver: latestTracking.approver,
        ttdPetugas: latestTracking.ttdPetugas,
        ttdApprover: latestTracking.ttdApprover,
        unsafe: latestTracking.safetyStatus === 'tidak_aman',
        testMode: latestTracking.telemetryTest,
        forcedStop: latestTracking.forcedStopAt
          ? { at: latestTracking.forcedStopAt, by: latestTracking.forcedStopper, reason: latestTracking.forcedStopReason ?? '' }
          : null,
        rejection: latestTracking.rejectedAt
          ? { at: latestTracking.rejectedAt, by: latestTracking.rejecter, reason: latestTracking.rejectionReason ?? '' }
          : null,
        earlyStopReason: latestTracking.earlyStopReason,
        reportedLoss: latestTracking.telemetryLoss,
        sampleCount: latestTracking._count.telemetrySamples,
        averageKmh: telemetry?.averageKmh ?? null,
        gpsGaps: await loadGpsGaps(prisma, latestTracking),
      },
      route,
      map,
      findings,
      speedEvents: latestTracking?.speedEvents ?? [],
      logo: reportLogo(),
      printedAt: new Date(),
    });

    const buffer = await pdfPrinter().createPdf(docDefinition).getBuffer();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan_Inspeksi_PPJ_${tugas.id}.pdf"`);
    return res.send(buffer);

  } catch (error) {
    console.error('Download Report error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
