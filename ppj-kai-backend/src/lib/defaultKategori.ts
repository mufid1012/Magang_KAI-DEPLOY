import prisma from '../config/database';

/**
 * Kategori temuan adalah data referensi yang HARUS ada: createLaporan menolak
 * setiap laporan yang kuncinya tidak terdaftar di tabel kategori_temuan.
 * Migrasi hanya membuat tabelnya, jadi database baru akan kosong dan semua
 * laporan kendala (termasuk darurat) gagal dengan "Kategori temuan tidak tersedia".
 *
 * Seed ini hanya jalan saat tabel benar-benar kosong, sehingga kategori yang
 * sudah dikustomisasi/dihapus admin tidak dihidupkan kembali.
 */
export const DEFAULT_KATEGORI_TEMUAN = [
  { key: 'kerusakan_rel', label: 'Kerusakan Rel', icon: 'railway_alert', color: 'error', sortOrder: 1 },
  { key: 'gangguan_struktur', label: 'Gangguan Struktur Jalur', icon: 'foundation', color: 'error', sortOrder: 2 },
  { key: 'anjlokan_kecelakaan', label: 'Anjlokan atau Kecelakaan', icon: 'train', color: 'error', sortOrder: 3 },
  { key: 'lainnya', label: 'Lainnya', icon: 'more_horiz', color: 'primary', sortOrder: 4 },
];

export async function ensureDefaultKategoriTemuan(): Promise<void> {
  try {
    const count = await prisma.kategoriTemuan.count();
    if (count > 0) return;
    await prisma.kategoriTemuan.createMany({ data: DEFAULT_KATEGORI_TEMUAN, skipDuplicates: true });
    console.log('[boot] kategori_temuan kosong -> seed default KAI (4 kategori)');
  } catch (error) {
    // Jangan blokir startup: error koneksi DB sudah ditangani request berikutnya.
    console.error('[boot] gagal memastikan kategori temuan default:', error);
  }
}
