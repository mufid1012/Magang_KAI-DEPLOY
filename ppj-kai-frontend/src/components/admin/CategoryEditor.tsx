'use client';
import type React from 'react';
import api from '../../lib/api';
import { showToast } from '../../lib/toast';
import { getApiErrorMessage } from '../../lib/utils';
import type { KategoriTemuan } from './types';

interface Props {
  editingKategori: KategoriTemuan | null;
  setShowKategoriModal: React.Dispatch<React.SetStateAction<boolean>>;
  kategoriForm: { key: string; label: string; icon: string; color: string; };
  setKategoriForm: React.Dispatch<React.SetStateAction<{ key: string; label: string; icon: string; color: string; }>>;
  ICON_OPTIONS: string[];
  savingKategori: boolean;
  setSavingKategori: React.Dispatch<React.SetStateAction<boolean>>;
  fetchKategori: () => Promise<void>;
}

export default function CategoryEditor({ editingKategori, setShowKategoriModal, kategoriForm, setKategoriForm, ICON_OPTIONS, savingKategori, setSavingKategori, fetchKategori }: Props) {
  return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-rose-400 text-[20px]">category</span>
                {editingKategori ? 'EDIT KATEGORI' : 'TAMBAH KATEGORI'}
              </h3>
              <button onClick={() => setShowKategoriModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              {/* Key */}
              {!editingKategori && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Key (Unik, tanpa spasi)</label>
                  <input
                    value={kategoriForm.key}
                    onChange={e => setKategoriForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-mono"
                    placeholder="contoh: patah_rel"
                  />
                </div>
              )}
              {/* Label */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Label (Tampil di UI)</label>
                <input
                  value={kategoriForm.label}
                  onChange={e => setKategoriForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm"
                  placeholder="contoh: Patah Rel"
                />
              </div>
              {/* Color */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Tingkat Kategori</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setKategoriForm(f => ({ ...f, color: 'error' }))}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all ${kategoriForm.color === 'error' ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    <div className="w-4 h-4 rounded-full bg-rose-500"></div> Darurat (Merah)
                  </button>
                  <button
                    onClick={() => setKategoriForm(f => ({ ...f, color: 'primary' }))}
                    className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-2 transition-all ${kategoriForm.color === 'primary' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                  >
                    <div className="w-4 h-4 rounded-full bg-blue-500"></div> Ringan (Biru)
                  </button>
                </div>
              </div>
              {/* Icon Picker */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Pilih Ikon</label>
                <div className="grid grid-cols-5 gap-2">
                  {ICON_OPTIONS.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setKategoriForm(f => ({ ...f, icon }))}
                      className={`flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all ${kategoriForm.icon === icon ? 'border-primary bg-primary/5 text-primary shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}
                    >
                      <span className="material-symbols-outlined text-[24px]">{icon}</span>
                      <span className="text-[8px] font-medium mt-1 truncate w-full text-center px-1">{icon.replace(/_/g, ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              <button onClick={() => setShowKategoriModal(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button
                disabled={savingKategori || !kategoriForm.label || (!editingKategori && !kategoriForm.key)}
                onClick={async () => {
                  try {
                    setSavingKategori(true);
                    if (editingKategori) {
                      await api.patch(`/admin/kategori-temuan/${editingKategori.id}`, {
                        label: kategoriForm.label,
                        icon: kategoriForm.icon,
                        color: kategoriForm.color,
                      });
                      showToast('Kategori berhasil diperbarui', 'success');
                    } else {
                      await api.post('/admin/kategori-temuan', kategoriForm);
                      showToast('Kategori berhasil ditambahkan', 'success');
                    }
                    setShowKategoriModal(false);
                    fetchKategori();
                  } catch (err: unknown) {
                    showToast(getApiErrorMessage(err, 'Gagal menyimpan kategori'), 'error');
                  } finally {
                    setSavingKategori(false);
                  }
                }}
                className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {savingKategori ? 'Menyimpan...' : (editingKategori ? 'Simpan Perubahan' : 'Tambah Kategori')}
              </button>
            </div>
          </div>
        </div>
      );
}
