'use client';
import type React from 'react';
import { petugasColor } from '../../../../shared/display';
import type { Petugas,Tugas } from './types';

interface Props {
  selectedPetugasHistory: Petugas;
  setSelectedPetugasHistory: React.Dispatch<React.SetStateAction<Petugas | null>>;
  tugas: Tugas[];
  STATUS_COLOR: Record<string, string>;
  STATUS_LABEL: Record<string, string>;
  haversineKm: (lat1: number, lng1: number, lat2: number, lng2: number) => string;
  JENIS_COLOR: Record<string, string>;
  JENIS_LABEL: Record<string, string>;
}

export default function PetugasHistory({ selectedPetugasHistory, setSelectedPetugasHistory, tugas, STATUS_COLOR, STATUS_LABEL, haversineKm, JENIS_COLOR, JENIS_LABEL }: Props) {
  return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-inner shrink-0" style={{ background: petugasColor(selectedPetugasHistory.nipp) }}>
                  {selectedPetugasHistory.nama.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedPetugasHistory.nama}</h3>
                  <p className="text-xs text-slate-400">{selectedPetugasHistory.nipp}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPetugasHistory(null)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Riwayat Pekerjaan Tracking</h4>
              <div className="space-y-3">
                {tugas.filter(t => t.user.nipp === selectedPetugasHistory.nipp).length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">history</span>
                    <p className="text-slate-500 text-sm font-medium">Belum ada riwayat pekerjaan.</p>
                  </div>
                ) : (
                  tugas.filter(t => t.user.nipp === selectedPetugasHistory.nipp).map(t => {
                    const latestTracking = t.tracking?.[0];
                    const laporanList = latestTracking?.laporan || [];

                    return (
                      <div key={t.id} className={`rounded-xl border shadow-sm relative overflow-hidden mb-4 ${t.status === 'need_approval' ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                        <div className={`absolute top-0 left-0 w-1.5 h-full ${t.status === 'completed' ? 'bg-primary' : t.status === 'need_approval' ? 'bg-amber-400' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-300'}`}></div>

                        <div className="p-4 pl-5 border-b border-slate-100">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <p className="font-bold text-slate-800 text-sm leading-snug">{t.jalur}</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                          <div className="flex items-center gap-4 pt-2">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">route</span>
                              <span className="font-semibold">{haversineKm(t.startPointLat, t.startPointLong, t.endPointLat, t.endPointLong)} km</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">timer</span>
                              <span className="font-semibold">{
                                latestTracking?.durasi
                                  ? latestTracking.durasi >= 3600
                                    ? `${Math.floor(latestTracking.durasi / 3600)} jam ${Math.floor((latestTracking.durasi % 3600) / 60)} menit`
                                    : latestTracking.durasi >= 60
                                    ? `${Math.floor(latestTracking.durasi / 60)} menit`
                                    : `${latestTracking.durasi} detik`
                                  : latestTracking?.startTime && latestTracking?.endTime
                                  ? `${Math.floor((new Date(latestTracking.endTime).getTime() - new Date(latestTracking.startTime).getTime()) / 60000)} menit`
                                  : '-'
                              }</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">flag</span>
                              <span className="font-semibold">{laporanList.length} laporan</span>
                            </div>
                          </div>
                        </div>

                        {/* Detail Laporan Kendala */}
                        {laporanList.length > 0 && (
                          <div className="bg-slate-50 p-4 pl-5">
                            <h5 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
                              <span className="material-symbols-outlined text-rose-500 text-[16px]">warning</span> Laporan Kendala
                            </h5>
                            <div className="space-y-3">
                              {laporanList.map((lap, idx) => (
                                <div key={lap.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                  {lap.foto && (
                                    <div className="w-full h-32 relative">
                                      <img src={lap.foto} alt={`Foto kendala ${idx + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                  )}
                                  <div className="p-3 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${JENIS_COLOR[lap.jenisTemuan] ?? 'bg-slate-100 text-slate-700'}`}>
                                        {JENIS_LABEL[lap.jenisTemuan] ?? lap.jenisTemuan}
                                      </span>
                                      <span className="font-medium text-[10px] text-slate-500">
                                        {new Date(lap.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                      </span>
                                    </div>
                                    {lap.deskripsi && <p className="text-xs text-slate-700">{lap.deskripsi}</p>}
                                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                                      <span>{lap.latitude.toFixed(5)}, {lap.longitude.toFixed(5)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {laporanList.length === 0 && (
                          <div className="bg-slate-50 p-3 pl-5 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                              <span className="material-symbols-outlined text-emerald-500 text-[18px]">verified</span>
                              Tidak ada kendala yang dilaporkan.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      );
}
