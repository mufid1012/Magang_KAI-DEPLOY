'use client';
import type React from 'react';

interface Props {
  setImportResult: React.Dispatch<React.SetStateAction<{ total: number; created: number; failed: number; details: { row: number; status: string; message: string; jalur?: string; }[]; } | null>>;
  importResult: { total: number; created: number; failed: number; details: { row: number; status: string; message: string; jalur?: string; }[]; };
}

export default function ImportResult({ setImportResult, importResult }: Props) {
  return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">task_alt</span>
                HASIL IMPORT EXCEL
              </h3>
              <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-white transition-colors flex items-center">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Summary */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl p-3 border border-slate-200 text-center">
                  <p className="text-2xl font-extrabold text-slate-800">{importResult.total}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Total Baris</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-center">
                  <p className="text-2xl font-extrabold text-emerald-700">{importResult.created}</p>
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-0.5">Berhasil</p>
                </div>
                <div className={`rounded-xl p-3 border text-center ${importResult.failed > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                  <p className={`text-2xl font-extrabold ${importResult.failed > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{importResult.failed}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${importResult.failed > 0 ? 'text-rose-600' : 'text-slate-500'}`}>Gagal</p>
                </div>
              </div>
            </div>

            {/* Detail List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {importResult.details.map((d, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                    d.status === 'success'
                      ? 'bg-emerald-50/50 border-emerald-100'
                      : 'bg-rose-50/50 border-rose-100'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] mt-0.5 shrink-0 ${
                    d.status === 'success' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {d.status === 'success' ? 'check_circle' : 'error'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Baris {d.row}</span>
                      {d.jalur && <span className="text-xs text-primary font-semibold truncate">{d.jalur}</span>}
                    </div>
                    <p className={`text-xs mt-0.5 ${d.status === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {d.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Close Button */}
            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
              <button
                onClick={() => setImportResult(null)}
                className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-[18px]">done</span>
                Tutup
              </button>
            </div>
          </div>
        </div>
      );
}
