'use client';
import type React from 'react';
import { petugasColor } from '../../../../shared/display';
import type { ManagedUser } from './types';

interface Props {
  userSearchQuery: string;
  setUserSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  handleOpenCreateUser: () => void;
  managedUsers: ManagedUser[];
  ROLE_LABEL: Record<string, string>;
  busyUserId: number | null;
  handleOpenEditUser: (u: ManagedUser) => void;
  handleToggleUserActive: (u: ManagedUser) => Promise<void>;
  handleDeleteUser: (u: ManagedUser) => Promise<void>;
}

export default function AdminAccounts({ userSearchQuery, setUserSearchQuery, handleOpenCreateUser, managedUsers, ROLE_LABEL, busyUserId, handleOpenEditUser, handleToggleUserActive, handleDeleteUser }: Props) {
  return (
          <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden p-3 md:p-4 gap-4">
            <div className="min-h-[500px] lg:min-h-0 flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-4 md:p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">Kelola Akun Pengguna</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Buat, edit, dan kelola akun QC, KUPT, dan PPJ</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                    <input
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                      placeholder="Cari NIPP atau nama..."
                      className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none w-56 font-medium"
                    />
                  </div>
                  <button onClick={handleOpenCreateUser} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]">
                    <span className="material-symbols-outlined text-[18px]">person_add</span> Buat Akun
                  </button>
                </div>
              </div>

              {/* User List */}
              <div className="flex-1 overflow-y-auto p-4">
                {managedUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">group</span>
                    <p className="text-slate-500 font-medium">Belum ada akun yang dibuat.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {managedUsers
                      .filter(u => {
                        if (!userSearchQuery) return true;
                        const q = userSearchQuery.toLowerCase();
                        return u.nipp.toLowerCase().includes(q) || u.nama.toLowerCase().includes(q);
                      })
                      .map(u => (
                        <div key={u.id} className={`bg-slate-50 rounded-2xl border p-5 relative group transition-all ${
                          u.isActive ? 'border-slate-200 hover:border-primary/30' : 'border-rose-200 bg-rose-50/50 opacity-70'
                        }`}>
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-inner shrink-0" style={{ background: petugasColor(u.nipp) }}>
                              {u.nama.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">{u.nama}</p>
                              <p className="text-xs text-slate-500 font-medium">{u.nipp}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              u.role === 'qc' ? 'bg-indigo-100 text-indigo-700' :
                              u.role === 'kupt' ? 'bg-teal-100 text-teal-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>{ROLE_LABEL[u.role] || u.role}</span>
                          </div>
                          {u.wilayahAssignments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {u.wilayahAssignments.map(wa => (
                                <span key={wa.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 font-semibold">
                                  {wa.wilayah.kode} {wa.wilayah.nama}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
                            <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                              u.isActive ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                              {u.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                            <span className="flex-1"></span>
                            <button title="Edit akun" aria-label={`Edit akun ${u.nama}`} disabled={busyUserId !== null} onClick={() => handleOpenEditUser(u)} className="text-slate-400 hover:text-primary transition-colors p-1 rounded hover:bg-primary/5">
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button title={u.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'} aria-label={`${u.isActive ? 'Nonaktifkan' : 'Aktifkan'} akun ${u.nama}`} disabled={busyUserId !== null} onClick={() => handleToggleUserActive(u)} className={`transition-colors p-1 rounded ${u.isActive ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                              <span className="material-symbols-outlined text-[18px]">{u.isActive ? 'person_off' : 'person'}</span>
                            </button>
                            <button title="Hapus permanen" aria-label={`Hapus permanen akun ${u.nama}`} disabled={busyUserId !== null} onClick={() => handleDeleteUser(u)} className="text-rose-600 hover:bg-rose-50 transition-colors p-1 rounded disabled:opacity-50">
                              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
}
