'use client';
import { useEffect, useState } from 'react';

interface Props {
  onAlertKereta: () => void;
  onLaporanDarurat: () => void;
  onKendala: () => void;
  sendingAlert: boolean;
  gpsReady: boolean;
}

/** One "Aksi" button during inspection that opens a bottom sheet with the PPJ's field actions. */
export default function ActionMenu({ onAlertKereta, onLaporanDarurat, onKendala, sendingAlert, gpsReady }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const run = (action: () => void) => { setOpen(false); action(); };
  const items = [
    { icon: sendingAlert ? 'hourglass_empty' : 'campaign', label: 'Alert Kereta', hint: 'Peringatkan PPJ terdekat di jalur yang sama', tone: 'bg-blue-600 text-white', onClick: () => run(onAlertKereta), disabled: sendingAlert || !gpsReady },
    { icon: 'warning', label: 'Laporan Darurat / Warning', hint: 'Laporkan temuan atau kondisi darurat jalur', tone: 'bg-error text-on-error', onClick: () => run(onLaporanDarurat), disabled: false },
    { icon: 'report', label: 'Kendala PPJ', hint: 'Sakit, HP bermasalah, cuaca, atau kendala lain', tone: 'bg-orange-500 text-white', onClick: () => run(onKendala), disabled: false },
    { icon: 'swap_horiz', label: 'Ganti PPJ', hint: 'Segera hadir', tone: 'bg-slate-300 text-slate-600', onClick: () => {}, disabled: true },
  ];

  return (
    <>
      <div className="fixed right-container-padding bottom-[180px] z-40 pointer-events-auto flex flex-col items-center">
        <button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="Aksi inspeksi"
          className="w-16 h-16 bg-error text-on-error rounded-full shadow-[0px_8px_24px_rgba(186,26,26,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95">
          <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>emergency_home</span>
        </button>
        <p className="mt-1 bg-white/90 rounded-full px-2 py-0.5 text-[9px] font-bold text-error text-center shadow">AKSI</p>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] bg-on-surface/50 backdrop-blur-sm flex items-end md:items-center justify-center pointer-events-auto" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Aksi inspeksi" onClick={e => e.stopPropagation()}
            className="bg-surface w-full max-w-lg rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden pb-safe">
            <div className="flex items-center justify-between px-md py-sm border-b border-surface-variant">
              <h3 className="font-h3 text-h3 text-on-surface">Aksi Inspeksi</h3>
              <button onClick={() => setOpen(false)} aria-label="Tutup" className="text-on-surface-variant"><span className="material-symbols-outlined">close</span></button>
            </div>
            <ul className="p-sm flex flex-col gap-xs">
              {items.map(item => (
                <li key={item.label}>
                  <button onClick={item.onClick} disabled={item.disabled}
                    className="w-full flex items-center gap-md p-sm rounded-xl hover:bg-surface-container-low active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed text-left">
                    <span className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${item.tone}`}>
                      <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
                    </span>
                    <span className="flex flex-col">
                      <span className="font-label-md text-on-surface font-bold">{item.label}</span>
                      <span className="text-[12px] text-on-surface-variant">{item.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
