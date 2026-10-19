'use client';
import type React from 'react';
import api from '../../lib/api';
import type { NotificationSound } from '../../lib/audio';
import { showConfirm } from '../../lib/confirm';
import { showToast } from '../../lib/toast';
import { getApiErrorMessage } from '../../lib/utils';
import LoginPhotoSettings from './LoginPhotoSettings';
import type { KategoriTemuan,Stats } from './types';

interface Props {
  isAdmin: boolean;
  handleAlertSoundChange: (sound: NotificationSound) => Promise<void>;
  savingAlertSound: boolean;
  alertSound: NotificationSound;
  canWrite: boolean;
  setEditingKategori: React.Dispatch<React.SetStateAction<KategoriTemuan | null>>;
  setKategoriForm: React.Dispatch<React.SetStateAction<{ key: string; label: string; icon: string; color: string; }>>;
  setShowKategoriModal: React.Dispatch<React.SetStateAction<boolean>>;
  kategoriList: KategoriTemuan[];
  reorderingKategori: boolean;
  setDragKategoriId: React.Dispatch<React.SetStateAction<number | null>>;
  setDragOverKategoriId: React.Dispatch<React.SetStateAction<number | null>>;
  dragKategoriId: number | null;
  handleKategoriDrop: (targetId: number) => void;
  dragOverKategoriId: number | null;
  fetchKategori: () => Promise<void>;
  user: { id?: number; nama: string; role: string; } | null;
  ROLE_LABEL: Record<string, string>;
  userRole: string;
  stats: Stats | null;
}

export default function AdminSettings({ isAdmin, handleAlertSoundChange, savingAlertSound, alertSound, canWrite, setEditingKategori, setKategoriForm, setShowKategoriModal, kategoriList, reorderingKategori, setDragKategoriId, setDragOverKategoriId, dragKategoriId, handleKategoriDrop, dragOverKategoriId, fetchKategori, user, ROLE_LABEL, userRole, stats }: Props) {
  return (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-3xl mx-auto space-y-8">
              {/* Settings Header */}
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center justify-center md:justify-start gap-3">
                  <span className="material-symbols-outlined text-primary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>settings</span>
                  Pengaturan
                </h2>
                <p className="text-sm text-slate-500 mt-2">Kelola sirine darurat, kategori temuan, dan pengaturan sistem lainnya.</p>
              </div>

              {isAdmin && <LoginPhotoSettings />}

              {/* ── Section 1: Sirine ──────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-rose-600 text-[22px]">notifications_active</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 text-[15px]">Pengaturan Sirine Darurat</h3>
                    <p className="text-xs text-slate-500 truncate">Atur jenis suara alarm saat ada laporan darurat masuk</p>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Pilih Jenis Sirine</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {([
                        { value: 'off' as NotificationSound, label: 'Mati', icon: 'notifications_off', desc: 'Tidak ada suara' },
                        { value: 'siren' as NotificationSound, label: 'Sirine', icon: 'emergency', desc: 'Suara sirine darurat' },
                        { value: 'beep' as NotificationSound, label: 'Beep', icon: 'campaign', desc: 'Suara beep berulang' },
                        { value: 'chime' as NotificationSound, label: 'Lonceng', icon: 'notifications', desc: 'Suara lonceng lembut' },
                      ]).map(s => (
                        <button
                          key={s.value}
                          onClick={() => handleAlertSoundChange(s.value)}
                          disabled={savingAlertSound}
                          className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 min-h-[100px] ${
                            alertSound === s.value
                              ? s.value === 'off'
                                ? 'border-slate-400 bg-slate-50 text-slate-700 shadow-md'
                                : 'border-rose-500 bg-rose-50 text-rose-700 shadow-md shadow-rose-100'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                          } disabled:opacity-60 disabled:cursor-wait`}
                        >
                          <span className="material-symbols-outlined text-[28px] mb-1.5" style={alertSound === s.value ? { fontVariationSettings: "'FILL' 1" } : {}}>{s.icon}</span>
                          <span className="text-sm font-bold leading-tight">{s.label}</span>
                          <span className="text-[10px] mt-1 opacity-70 leading-tight text-center">{s.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-slate-400 text-[20px] mt-0.5 shrink-0">info</span>
                    <div className="text-xs text-slate-600 leading-relaxed">
                      <p className="font-semibold text-slate-700 mb-1">Bagaimana alarm bekerja?</p>
                      <p>Hanya laporan dengan tingkat <strong>Darurat (merah)</strong> yang memutar alarm secara berulang dan dibacakan melalui Text-to-Speech. Laporan <strong>Ringan (biru)</strong> tetap tercatat tanpa suara sirine.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Kategori Temuan ──────────────────── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-blue-600 text-[22px]">category</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 text-[15px]">Kelola Kategori Temuan</h3>
                      <p className="text-xs text-slate-500 truncate">Kategori yang tampil saat petugas membuat laporan kendala</p>
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => {
                        setEditingKategori(null);
                        setKategoriForm({ key: '', label: '', icon: 'warning', color: 'error' });
                        setShowKategoriModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-primary/90 transition-colors shadow-sm shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      <span className="hidden sm:inline">Tambah</span>
                    </button>
                  )}
                </div>
                <div className="p-5">
                  {kategoriList.length === 0 ? (
                    <div className="text-center py-10">
                      <span className="material-symbols-outlined text-slate-300 text-[48px]">category</span>
                      <p className="text-sm text-slate-400 mt-2">Belum ada kategori. Tambahkan kategori pertama!</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {canWrite && kategoriList.length > 1 && (
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                          <span className="material-symbols-outlined text-[14px]">drag_indicator</span>
                          Seret kartu untuk mengatur urutan tampil di petugas
                          {reorderingKategori && <span className="text-primary font-medium">· menyimpan…</span>}
                        </p>
                      )}
                      {kategoriList.map(k => (
                        <div
                          key={k.id}
                          draggable={canWrite}
                          onDragStart={() => canWrite && setDragKategoriId(k.id)}
                          onDragEnd={() => { setDragKategoriId(null); setDragOverKategoriId(null); }}
                          onDragOver={e => { if (canWrite && dragKategoriId != null) { e.preventDefault(); setDragOverKategoriId(k.id); } }}
                          onDrop={e => { if (canWrite) { e.preventDefault(); handleKategoriDrop(k.id); } }}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${canWrite ? 'cursor-grab active:cursor-grabbing' : ''} ${
                            dragKategoriId === k.id ? 'opacity-40' : ''
                          } ${
                            dragOverKategoriId === k.id && dragKategoriId !== k.id ? 'ring-2 ring-primary ring-offset-1' : ''
                          } ${
                            k.isActive
                              ? k.color === 'error'
                                ? 'bg-rose-50/50 border-rose-200 hover:shadow-sm'
                                : 'bg-blue-50/50 border-blue-200 hover:shadow-sm'
                              : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {canWrite && (
                              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0 -ml-1" title="Seret untuk mengurutkan">drag_indicator</span>
                            )}
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              k.color === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                            }`}>
                              <span className="material-symbols-outlined text-[22px]">{k.icon}</span>
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-bold truncate ${k.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{k.label}</p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">{k.key}</p>
                            </div>
                            {!k.isActive && (
                              <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 shrink-0">Nonaktif</span>
                            )}
                          </div>
                          {canWrite && (
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <button
                                onClick={() => {
                                  setEditingKategori(k);
                                  setKategoriForm({ key: k.key, label: k.label, icon: k.icon, color: k.color });
                                  setShowKategoriModal(true);
                                }}
                                className="p-2 rounded-lg hover:bg-white text-slate-500 hover:text-primary transition-colors"
                                title="Edit kategori"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              <button
                                onClick={async () => {
                                  if (!(await showConfirm(`Hapus kategori "${k.label}"? Tindakan ini permanen.`))) return;
                                  try {
                                    await api.delete(`/admin/kategori-temuan/${k.id}`);
                                    fetchKategori();
                                    showToast('Kategori dihapus', 'success');
                                  } catch (err: unknown) {
                                    showToast(getApiErrorMessage(err, 'Gagal menghapus'), 'error');
                                  }
                                }}
                                className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Hapus kategori"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 3: Info Sistem ──────────────────────── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-slate-600 text-[22px]">info</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 text-[15px]">Informasi Sistem</h3>
                    <p className="text-xs text-slate-500 truncate">Detail aplikasi dan sesi Anda saat ini</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 flex flex-col">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Aplikasi</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug">KAI RailTrack PPJ</p>
                      <p className="text-xs text-slate-500 mt-auto pt-1">v1.0.0 — DAOP 6 Yogyakarta</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 flex flex-col">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Login Sebagai</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug">{user?.nama || '-'}</p>
                      <p className="text-xs text-slate-500 mt-auto pt-1">Role: {ROLE_LABEL[userRole] || userRole}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 flex flex-col">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Statistik</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug">{stats?.totalPetugas ?? '-'} Petugas</p>
                      <p className="text-xs text-slate-500 mt-auto pt-1">{kategoriList.filter(k => k.isActive).length} kategori aktif</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        );
}
