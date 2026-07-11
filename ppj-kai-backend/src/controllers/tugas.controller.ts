import { Request, Response } from 'express';
import prisma from '../config/database';
import { renderStaticMap } from '../lib/staticMap';

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
        },
      },
    });

    return res.json({ success: true, data: tugas });
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
      where: { id: parseInt(id), assignedTo: userId },
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

    return res.json({ success: true, data: tugas });
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
      }
    });

    // Mocking emergency reports count for the prototype
    const emergencyReports = await prisma.laporan.count({
      where: {
        tracking: {
          tugas: {
            assignedTo: userId
          }
        },
        jenisTemuan: 'emergency'
      }
    });

    const summary = {
      totalTasks: tugas.length,
      completed: tugas.filter(t => t.status === 'completed').length,
      inProgress: tugas.filter(t => t.status === 'in_progress').length,
      pending: tugas.filter(t => t.status === 'pending').length,
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
    const userId = (req as any).user.id;

    // Ambil data tugas beserta tracking & laporan
    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: parseInt(id), assignedTo: userId },
      include: {
        tracking: {
          orderBy: { createdAt: 'desc' },
          include: {
            laporan: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!tugas) {
      return res.status(404).json({ success: false, message: 'Tugas not found' });
    }

    const latestTracking = tugas.tracking[0] || null;
    const laporanList = latestTracking?.laporan || [];

    // Parse route path
    let routePath: [number, number][] = [];
    if (latestTracking?.routePath) {
      try {
        const parsed = JSON.parse(latestTracking.routePath);
        if (Array.isArray(parsed) && parsed.length > 0) routePath = parsed;
      } catch { /* ignore */ }
    }

    // Calculate distance from routePath
    const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const totalDistanceM = routePath.reduce((sum, point, i) => {
      if (i === 0) return 0;
      return sum + haversineM(routePath[i - 1][0], routePath[i - 1][1], point[0], point[1]);
    }, 0);
    const totalDistanceKm = (totalDistanceM / 1000).toFixed(2);

    // Render static map image server-side from routePath
    let mapImageBase64: string | null = null;
    if (routePath.length >= 2) {
      try {
        mapImageBase64 = await renderStaticMap(routePath, 800, 400);
      } catch (mapErr) {
        console.error('Failed to render static map:', mapErr);
      }
    }

    // Setup pdfmake with standard Helvetica font
    const pdfmake = require('pdfmake');
    pdfmake.fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };

    // Helper formatter
    const formatTime = (dateStr: Date | null) => {
      if (!dateStr) return '-';
      return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
    };
    const formatDate = (dateStr: Date) => {
      return new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
    };
    const formatDurasi = (detik: number | null) => {
      if (!detik) return '-';
      const h = Math.floor(detik / 3600);
      const m = Math.floor((detik % 3600) / 60);
      if (h > 0) return `${h}j ${m}m`;
      if (m > 0) return `${m} menit`;
      return `${detik} detik`;
    };

    // Build info table rows
    const infoRows: any[][] = [
      ['Jalur', `: ${tugas.jalur}`],
      ['Tanggal', `: ${formatDate(tugas.tanggal)}`],
      ['Waktu', `: ${formatTime(latestTracking?.startTime || null)} — ${formatTime(latestTracking?.endTime || null)} (${formatDurasi(latestTracking?.durasi || null)})`],
      ['Status', `: ${tugas.status.toUpperCase()}`],
      ['ID Tugas', `: #PPJ-${String(tugas.id).padStart(6, '0')}`],
    ];
    if (routePath.length >= 2) {
      infoRows.push(['Jarak Tempuh', `: ${totalDistanceKm} km (${routePath.length} titik GPS)`]);
    }

    // Build PDF content
    const docDefinition: any = {
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10,
        lineHeight: 1.5
      },
      content: [
        { text: 'PT KERETA API INDONESIA (Persero)', style: 'header' },
        { text: 'LAPORAN INSPEKSI JALUR PPJ', style: 'subheader', margin: [0, 0, 0, 20] },
        
        {
          layout: 'noBorders',
          table: {
            widths: [100, '*'],
            body: infoRows
          },
          margin: [0, 0, 0, 20]
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, alignment: 'center' },
        subheader: { fontSize: 14, bold: true, alignment: 'center', color: '#444444' },
        sectionHeader: { fontSize: 12, bold: true, decoration: 'underline' },
        laporanTitle: { fontSize: 11, bold: true },
        laporanDesc: { fontSize: 10 },
        laporanMeta: { fontSize: 9, color: '#666666' }
      }
    };

    // Add route map image if available
    if (mapImageBase64) {
      docDefinition.content.push({ text: 'PETA JALUR INSPEKSI', style: 'sectionHeader', margin: [0, 10, 0, 10] });
      docDefinition.content.push({
        image: mapImageBase64,
        width: 480,
        alignment: 'center',
        margin: [0, 0, 0, 5]
      });
      docDefinition.content.push({
        text: `Jalur yang dilalui petugas selama inspeksi (${totalDistanceKm} km)`,
        style: 'laporanMeta',
        alignment: 'center',
        margin: [0, 0, 0, 20]
      });
    } else if (routePath.length >= 2) {
      // Fallback: just mention route info textually
      docDefinition.content.push({ text: 'JALUR INSPEKSI', style: 'sectionHeader', margin: [0, 10, 0, 10] });
      docDefinition.content.push({
        text: `Petugas menempuh ${totalDistanceKm} km dari titik (${routePath[0][0].toFixed(5)}, ${routePath[0][1].toFixed(5)}) ke (${routePath[routePath.length - 1][0].toFixed(5)}, ${routePath[routePath.length - 1][1].toFixed(5)}).`,
        margin: [0, 0, 0, 20]
      });
    }
    // Add foto awal and foto selesai if available
    if (latestTracking && (latestTracking.fotoAwal || latestTracking.fotoSelesai)) {
      docDefinition.content.push({ text: 'VERIFIKASI IDENTITAS', style: 'sectionHeader', margin: [0, 10, 0, 10] });
      
      const identityTableBody = [
        [
          latestTracking.fotoAwal ? { text: 'Foto Awal (Mulai)', style: 'laporanTitle', alignment: 'center' } : '',
          latestTracking.fotoSelesai ? { text: 'Foto Akhir (Selesai)', style: 'laporanTitle', alignment: 'center' } : ''
        ],
        [
          latestTracking.fotoAwal && latestTracking.fotoAwal.startsWith('data:image/') ? { image: latestTracking.fotoAwal, width: 200, alignment: 'center' } : '',
          latestTracking.fotoSelesai && latestTracking.fotoSelesai.startsWith('data:image/') ? { image: latestTracking.fotoSelesai, width: 200, alignment: 'center' } : ''
        ]
      ];

      docDefinition.content.push({
        layout: 'noBorders',
        table: {
          widths: ['*', '*'],
          body: identityTableBody
        },
        margin: [0, 0, 0, 20]
      });
    }

    docDefinition.content.push({ text: 'DAFTAR TEMUAN', style: 'sectionHeader', margin: [0, 10, 0, 10] });

    if (laporanList.length === 0) {
      docDefinition.content.push({ text: 'Inspeksi berlangsung tanpa ada temuan kendala.', italics: true, color: '#555555' });
    } else {
      laporanList.forEach((lap, idx) => {
        docDefinition.content.push({
          text: `${idx + 1}. [${lap.jenisTemuan.toUpperCase()}] ${formatTime(lap.createdAt)}`,
          style: 'laporanTitle',
          margin: [0, 10, 0, 2]
        });
        
        if (lap.deskripsi) {
          docDefinition.content.push({
            text: `Deskripsi: ${lap.deskripsi}`,
            style: 'laporanDesc',
            margin: [15, 0, 0, 2]
          });
        }
        
        docDefinition.content.push({
          text: `Koordinat: ${lap.latitude.toFixed(5)}, ${lap.longitude.toFixed(5)}`,
          style: 'laporanMeta',
          margin: [15, 0, 0, 5]
        });

        // if there's a photo, and it's base64, embed it
        if (lap.foto && lap.foto.startsWith('data:image/')) {
          try {
            docDefinition.content.push({
              image: lap.foto,
              width: 250,
              margin: [15, 5, 0, 10]
            });
          } catch (e) {
            console.error('Failed to embed image for laporan', lap.id, e);
          }
        }
      });
    }

    docDefinition.content.push({
      text: `\n\nDicetak pada: ${formatDate(new Date())} ${formatTime(new Date())}`,
      style: 'laporanMeta',
      alignment: 'right',
      margin: [0, 30, 0, 0]
    });

    const doc = pdfmake.createPdf(docDefinition);
    const buffer = await doc.getBuffer();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan_Inspeksi_PPJ_${tugas.id}.pdf"`);
    return res.send(buffer);

  } catch (error) {
    console.error('Download Report error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
