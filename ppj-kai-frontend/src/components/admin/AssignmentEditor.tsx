'use client';
import type React from 'react';
import type { StationPoint } from '../../lib/stations';
import type { Petugas,RegisteredMapLocation } from './types';

interface Props {
  setShowTaskModal: React.Dispatch<React.SetStateAction<boolean>>;
  form: { jalur: string; tanggal: string; assignedTo: string; startPointName: string; endPointName: string; startPointLat: string; startPointLong: string; endPointLat: string; endPointLong: string; startMapLocationId: string; endMapLocationId: string; jamMulai: string; jamSelesai: string; };
  setForm: React.Dispatch<React.SetStateAction<{ jalur: string; tanggal: string; assignedTo: string; startPointName: string; endPointName: string; startPointLat: string; startPointLong: string; endPointLat: string; endPointLong: string; startMapLocationId: string; endMapLocationId: string; jamMulai: string; jamSelesai: string; }>>;
  petugas: Petugas[];
  handleStartPointChange: (selection: string) => void;
  filteredStations: readonly StationPoint[];
  isAdmin: boolean;
  registeredMapLocations: RegisteredMapLocation[];
  handleEndPointChange: (selection: string) => void;
  haversineKm: (lat1: number, lng1: number, lat2: number, lng2: number) => string;
  loadingTaskLocations: boolean;
  handleCreateTugas: () => Promise<void>;
  submitting: boolean;
}

export default function AssignmentEditor({ setShowTaskModal, form, setForm, petugas, handleStartPointChange, filteredStations, isAdmin, registeredMapLocations, handleEndPointChange, haversineKm, loadingTaskLocations, handleCreateTugas, submitting }: Props) {
  return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide"><span className="material-symbols-outlined text-primary text-[20px]">add_task</span> TUGASKAN PETUGAS</h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-white transition-colors flex items-center"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1 bg-slate-50/50">
              {/* Petugas */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Pilih Petugas Pemeriksa</label>
                <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium">
                  <option value="">-- Silakan Pilih Petugas --</option>
                  {petugas.map(p => <option key={p.id} value={p.id}>{p.nama} ({p.nipp})</option>)}
                </select>
              </div>

              {/* Inspection point dropdowns: stations + registered MAP locations */}
              <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-widest block mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[16px]">train</span> Titik Lokasi Pengecekan
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start inspection point */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">trip_origin</span> Titik Awal
                    </label>
                    <select
                      value={form.startMapLocationId ? `map:${form.startMapLocationId}` : form.startPointName ? `station:${form.startPointName}` : ''}
                      onChange={e => handleStartPointChange(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-sm font-medium"
                    >
                      <option value="">-- Pilih Titik Awal --</option>
                      <optgroup label="Stasiun">
                        {filteredStations.map(s => (
                          <option key={s.name} value={`station:${s.name}`}>
                            {s.name} ({s.lat.toFixed(4)}, {s.lng.toFixed(4)})
                          </option>
                        ))}
                      </optgroup>
                      {isAdmin && registeredMapLocations.length > 0 && (
                        <optgroup label="Titik MAP Terdaftar">
                          {registeredMapLocations.map(location => (
                            <option key={location.id} value={`map:${location.id}`}>
                              {location.name} ({location.latitude.toFixed(4)}, {location.longitude.toFixed(4)})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>

                    {form.startPointLat && (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        {form.startPointLat}, {form.startPointLong}
                      </div>
                    )}
                  </div>
                  {/* End inspection point */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-rose-600 uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">location_on</span> Titik Akhir
                    </label>
                    <select
                      value={form.endMapLocationId ? `map:${form.endMapLocationId}` : form.endPointName ? `station:${form.endPointName}` : ''}
                      onChange={e => handleEndPointChange(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none shadow-sm font-medium"
                    >
                      <option value="">-- Pilih Titik Akhir --</option>
                      <optgroup label="Stasiun">
                        {filteredStations.map(s => (
                          <option key={s.name} value={`station:${s.name}`}>
                            {s.name} ({s.lat.toFixed(4)}, {s.lng.toFixed(4)})
                          </option>
                        ))}
                      </optgroup>
                      {isAdmin && registeredMapLocations.length > 0 && (
                        <optgroup label="Titik MAP Terdaftar">
                          {registeredMapLocations.map(location => (
                            <option key={location.id} value={`map:${location.id}`}>
                              {location.name} ({location.latitude.toFixed(4)}, {location.longitude.toFixed(4)})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {form.endPointLat && (
                      <div className="flex items-center gap-1.5 text-[10px] text-rose-600 font-semibold bg-rose-50 rounded-lg px-3 py-1.5 border border-rose-100">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        {form.endPointLat}, {form.endPointLong}
                      </div>
                    )}
                  </div>
                </div>
                {form.startPointLat && form.endPointLat && (
                  <div className="mt-4 flex items-center justify-between bg-blue-50 py-2.5 px-4 rounded-lg border border-blue-100">
                    <span className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Estimasi Jarak</span>
                    <span className="text-sm font-extrabold text-blue-700">{haversineKm(parseFloat(form.startPointLat), parseFloat(form.startPointLong), parseFloat(form.endPointLat), parseFloat(form.endPointLong))} km</span>
                  </div>
                )}
                {isAdmin && (
                  <p className="mt-3 text-[10px] text-slate-500 flex items-center gap-1.5">
                    <span className={`material-symbols-outlined text-[14px] ${loadingTaskLocations ? 'animate-spin' : 'text-primary'}`}>{loadingTaskLocations ? 'progress_activity' : 'add_location_alt'}</span>
                    {loadingTaskLocations ? 'Mengambil titik MAP terdaftar...' : `${registeredMapLocations.length} titik dari menu MAP tersedia untuk penugasan.`}
                  </p>
                )}
              </div>

              {/* Nama Jalur */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Nama Jalur Inspeksi</label>
                <input value={form.jalur} onChange={e => setForm(f => ({ ...f, jalur: e.target.value }))} placeholder="Otomatis terisi dari titik yang dipilih" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>

              {/* Tanggal */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Tanggal Inspeksi</label>
                <input type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>

              {/* Jam Mulai & Jam Selesai */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-emerald-600">schedule</span> Jam Mulai
                  </label>
                  <input type="time" value={form.jamMulai} onChange={e => setForm(f => ({ ...f, jamMulai: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-rose-600">schedule</span> Jam Selesai
                  </label>
                  <input type="time" value={form.jamSelesai} onChange={e => setForm(f => ({ ...f, jamSelesai: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              <button onClick={() => setShowTaskModal(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button onClick={handleCreateTugas} disabled={submitting} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">send</span>
                {submitting ? 'Menyimpan...' : 'Simpan & Tugaskan'}
              </button>
            </div>
          </div>
        </div>
      );
}
