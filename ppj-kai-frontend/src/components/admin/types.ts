export interface Petugas { id: number; nipp: string; nama: string; tugasPpj: { id: number; jalur: string; status: string }[] }

export interface Tugas { id: number; jalur: string; tanggal: string; startPointLat: number; startPointLong: number; endPointLat: number; endPointLong: number; startPointName: string; endPointName: string; status: string; user: { nama: string; nipp: string; jabatan?: string | null; division?: string | null; workArea?: string | null }, tracking?: { id: number; startTime: string | null; endTime: string | null; durasi: number | null; status: string; fotoAwal?: string | null; fotoSelesai?: string | null; approvalStatus: 'not_approved' | 'approved'; safetyStatus: 'aman' | 'tidak_aman'; approvedAt?: string | null; laporan: Emergency[] }[] }

export interface Emergency { id: number; latitude: number; longitude: number; jenisTemuan: string; deskripsi: string; foto: string | null; createdAt: string; tracking?: { tugas: { jalur: string; user: { nama: string; nipp: string } } } }

export interface LivePosition { petugasNama: string; petugasNipp: string; tugasId: number; jalur: string; latitude: number; longitude: number; updatedAt: string }

export interface RegisteredMapLocation { id: number; name: string; address: string | null; latitude: number; longitude: number }

export interface Stats { totalPetugas: number; tugasAktif: number; tugasSelesai: number; laporanDarurat: number }

export interface ManagedUser { id: number; nipp: string; nama: string; role: string; isActive: boolean; jabatan?: string; division?: string; workArea?: string; phone?: string; managerId?: number; createdAt: string; wilayahAssignments: { id: number; wilayah: { id: number; kode: string; nama: string; stations: string } }[] }

export interface WilayahItem { id: number; kode: string; nama: string; stations: string }

export interface KategoriTemuan { id: number; key: string; label: string; icon: string; color: string; isActive: boolean; sortOrder: number }

export type TugasStatusFilter = 'all' | 'pending' | 'in_progress' | 'need_approval' | 'completed';
