'use client';
import type React from 'react';
import { petugasColor } from '../../../../shared/display';

interface Props {
  setShowAddPetugasModal: React.Dispatch<React.SetStateAction<boolean>>;
  searchPetugas: string;
  setSearchPetugas: React.Dispatch<React.SetStateAction<string>>;
  availablePetugas: { id: number; nipp: string; nama: string; }[];
  selectedNipps: string[];
  setSelectedNipps: React.Dispatch<React.SetStateAction<string[]>>;
  handleAddPetugas: () => Promise<void>;
  addingPetugas: boolean;
}

export default function PetugasPicker({ setShowAddPetugasModal, searchPetugas, setSearchPetugas, availablePetugas, selectedNipps, setSelectedNipps, handleAddPetugas, addingPetugas }: Props) {
  return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3"><span className="material-symbols-outlined text-primary text-[20px]">person_add</span> TAMBAH PETUGAS</h3>
              <button onClick={() => setShowAddPetugasModal(false)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-5 border-b border-slate-100 shrink-0">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                  value={searchPetugas}
                  onChange={e => setSearchPetugas(e.target.value)}
                  placeholder="Cari nama atau NIPP petugas..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50">
              {availablePetugas.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">Tidak ada petugas yang tersedia.</div>
              ) : (
                <div className="space-y-1.5 p-2">
                  {availablePetugas
                    .filter(p => p.nama.toLowerCase().includes(searchPetugas.toLowerCase()) || p.nipp.toLowerCase().includes(searchPetugas.toLowerCase()))
                    .map(p => {
                      const isSelected = selectedNipps.includes(p.nipp);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedNipps(prev => prev.filter(n => n !== p.nipp));
                            } else {
                              setSelectedNipps(prev => [...prev, p.nipp]);
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSelected ? 'bg-primary-container/10 border-primary shadow-sm' : 'bg-white border-slate-200 hover:border-primary/50 hover:bg-slate-50'}`}
                        >
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style={{ background: petugasColor(p.nipp) }}>
                            {p.nama.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold truncate text-sm ${isSelected ? 'text-primary' : 'text-slate-800'}`}>{p.nama}</p>
                            <p className="text-xs text-slate-500 font-medium">{p.nipp}</p>
                          </div>
                          {isSelected ? (
                            <span className="material-symbols-outlined text-primary">check_circle</span>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300"></div>
                          )}
                        </button>
                      );
                  })}
                  {availablePetugas.filter(p => p.nama.toLowerCase().includes(searchPetugas.toLowerCase()) || p.nipp.toLowerCase().includes(searchPetugas.toLowerCase())).length === 0 && (
                    <div className="p-4 text-center text-slate-500 text-sm">Pencarian tidak ditemukan.</div>
                  )}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              <button onClick={() => setShowAddPetugasModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button onClick={handleAddPetugas} disabled={addingPetugas || selectedNipps.length === 0} className="flex-[2] py-2.5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                {addingPetugas ? 'Menambahkan...' : `Tambahkan (${selectedNipps.length})`}
              </button>
            </div>
          </div>
        </div>
      );
}
