'use client';
import type React from 'react';
import type { ManagedUser,WilayahItem } from './types';

interface Props {
  editingUser: ManagedUser | null;
  setShowUserModal: React.Dispatch<React.SetStateAction<boolean>>;
  userForm: { nipp: string; nama: string; password: string; role: string; wilayahIds: number[]; petugasIds: number[]; };
  setUserForm: React.Dispatch<React.SetStateAction<{ nipp: string; nama: string; password: string; role: string; wilayahIds: number[]; petugasIds: number[]; }>>;
  allWilayah: WilayahItem[];
  managedPetugasSearch: string;
  setManagedPetugasSearch: React.Dispatch<React.SetStateAction<string>>;
  managedUsers: ManagedUser[];
  handleSaveUser: () => Promise<void>;
  savingUser: boolean;
}

export default function UserEditor({ editingUser, setShowUserModal, userForm, setUserForm, allWilayah, managedPetugasSearch, setManagedPetugasSearch, managedUsers, handleSaveUser, savingUser }: Props) {
  return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-primary text-[20px]">{editingUser ? 'edit' : 'person_add'}</span>
                {editingUser ? 'EDIT AKUN' : 'BUAT AKUN BARU'}
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1 bg-slate-50/50">
              {/* NIPP */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">NIPP</label>
                <input value={userForm.nipp} onChange={e => setUserForm(f => ({ ...f, nipp: e.target.value }))} disabled={!!editingUser} placeholder="Contoh: QC-A001" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium disabled:bg-slate-100 disabled:text-slate-400" />
              </div>
              {/* Nama */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Nama Lengkap</label>
                <input value={userForm.nama} onChange={e => setUserForm(f => ({ ...f, nama: e.target.value }))} placeholder="Nama pengguna" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>
              {/* Password */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">{editingUser ? 'Password Baru (opsional)' : 'Password'}</label>
                <input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Min. 6 karakter'} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>
              {/* Role */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Role</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value, wilayahIds: [], petugasIds: [] }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium">
                  <option value="ppj">PPJ (Petugas Pemeriksa Jalur)</option>
                  <option value="qc">QC (Quality Control)</option>
                  <option value="kupt">KUPT</option>
                  <option value="guest">Guest (monitoring)</option>
                </select>
              </div>
              {/* Wilayah (for QC/KUPT) */}
              {(userForm.role === 'qc' || userForm.role === 'kupt') && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                    Wilayah {userForm.role === 'kupt' ? '(Minimal 2)' : '(Pilih beberapa)'}
                  </label>
                  <div className="border border-slate-300 rounded-xl bg-white p-3 max-h-48 overflow-y-auto space-y-2">
                    {allWilayah.map(w => {
                      const checked = userForm.wilayahIds.includes(w.id);
                      return (
                        <label key={w.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary/5 border border-primary/20' : 'hover:bg-slate-50 border border-transparent'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setUserForm(f => ({ ...f, wilayahIds: checked ? f.wilayahIds.filter(id => id !== w.id) : [...f.wilayahIds, w.id] }));
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-slate-800">{w.kode}</span>
                            <span className="text-xs text-slate-500 ml-2">{w.nama}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {userForm.wilayahIds.length > 0 && (
                    <p className={`text-xs font-semibold mt-2 ${userForm.role === 'kupt' && userForm.wilayahIds.length < 2 ? 'text-amber-600' : 'text-primary'}`}>
                      {userForm.wilayahIds.length} wilayah dipilih{userForm.role === 'kupt' && userForm.wilayahIds.length < 2 ? ' — pilih 1 lagi' : ''}
                    </p>
                  )}
                </div>
              )}
              {/* Petugas managed by KUPT */}
              {userForm.role === 'kupt' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Petugas yang Dikelola</label>
                  <div className="relative mb-2">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]">search</span>
                    <input
                      value={managedPetugasSearch}
                      onChange={e => setManagedPetugasSearch(e.target.value)}
                      placeholder="Cari nama atau NIPP petugas..."
                      className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    />
                  </div>
                  <div className="border border-slate-300 rounded-xl bg-white p-3 max-h-56 overflow-y-auto space-y-2">
                    {managedUsers
                      .filter(candidate => candidate.role === 'ppj')
                      .filter(candidate => {
                        const query = managedPetugasSearch.trim().toLowerCase();
                        return !query || candidate.nama.toLowerCase().includes(query) || candidate.nipp.toLowerCase().includes(query);
                      })
                      .map(candidate => {
                        const checked = userForm.petugasIds.includes(candidate.id);
                        const currentManager = candidate.managerId
                          ? managedUsers.find(manager => manager.id === candidate.managerId)
                          : null;
                        const managerLabel = candidate.managerId === editingUser?.id
                          ? 'Dikelola KUPT ini'
                          : currentManager
                            ? `Saat ini: ${currentManager.nama}`
                            : candidate.managerId
                              ? 'Saat ini: Super Admin'
                              : 'Belum ada pengelola';
                        return (
                          <label key={candidate.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary/5 border border-primary/20' : 'hover:bg-slate-50 border border-transparent'}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setUserForm(formValue => ({
                                ...formValue,
                                petugasIds: checked
                                  ? formValue.petugasIds.filter(id => id !== candidate.id)
                                  : [...formValue.petugasIds, candidate.id],
                              }))}
                              className="rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{candidate.nama}</p>
                              <p className="text-[11px] text-slate-500">{candidate.nipp} · {managerLabel}</p>
                            </div>
                            {!candidate.isActive && <span className="text-[9px] font-bold uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Nonaktif</span>}
                          </label>
                        );
                      })}
                    {managedUsers.filter(candidate => candidate.role === 'ppj').length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-3">Belum ada akun petugas PPJ.</p>
                    )}
                  </div>
                  <p className="text-xs text-primary font-semibold mt-2">{userForm.petugasIds.length} petugas dipilih</p>
                  <p className="text-[11px] text-slate-500 mt-1">Petugas yang sebelumnya dikelola pihak lain akan dipindahkan ke KUPT ini.</p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button onClick={handleSaveUser} disabled={savingUser} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {savingUser ? 'Menyimpan...' : (editingUser ? 'Simpan Perubahan' : 'Buat Akun')}
              </button>
            </div>
          </div>
        </div>
      );
}
