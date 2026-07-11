import { Request, Response } from 'express';
import prisma from '../config/database';

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
            body: [
              ['Jalur', `: ${tugas.jalur}`],
              ['Tanggal', `: ${formatDate(tugas.tanggal)}`],
              ['Waktu', `: ${formatTime(latestTracking?.startTime || null)} — ${formatTime(latestTracking?.endTime || null)} (${formatDurasi(latestTracking?.durasi || null)})`],
              ['Status', `: ${tugas.status.toUpperCase()}`],
              ['ID Tugas', `: #PPJ-${String(tugas.id).padStart(6, '0')}`],
            ]
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
