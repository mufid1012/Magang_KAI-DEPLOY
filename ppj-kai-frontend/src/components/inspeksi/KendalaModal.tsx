'use client';
import { useState } from 'react';
import { KENDALA_REASONS } from '../../../../shared/display';

const MAX_NOTE = 500;

/** PPJ reports a problem with themselves or their device (not a track finding) to their manager. */
export default function KendalaModal({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  if (!open) return null;

  const close = () => { setReason(''); setNote(''); onClose(); };
  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try { if (await onSubmit(reason, note.trim())) close(); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-on-surface/50 backdrop-blur-sm flex flex-col items-center justify-end md:justify-center p-0 md:p-container-padding pointer-events-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="kendala-title" className="bg-surface w-full max-w-lg rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-orange-500 px-md py-sm flex items-center justify-between">
          <h3 id="kendala-title" className="font-h3 text-h3 text-white flex items-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>report</span> Kendala PPJ
          </h3>
          <button onClick={close} aria-label="Tutup" className="text-white/80 hover:text-white"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-md flex flex-col gap-md max-h-[60vh] overflow-y-auto">
          <p className="text-[13px] text-on-surface-variant">Laporan dikirim ke pengelola Anda. Inspeksi tetap berjalan sampai Anda menyelesaikannya atau pengelola menghentikannya.</p>
          <fieldset className="flex flex-col gap-xs">
            <legend className="font-label-sm text-label-sm text-on-surface-variant uppercase mb-xs">Jenis kendala</legend>
            {KENDALA_REASONS.map(r => (
              <label key={r} className={`flex items-center gap-sm p-sm rounded-xl border-2 cursor-pointer ${reason === r ? 'border-orange-500 bg-orange-50' : 'border-outline-variant'}`}>
                <input type="radio" name="kendala" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-orange-500" />
                <span className="font-body-md text-on-surface">{r}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-xs">
            <label htmlFor="kendala-note" className="font-label-sm text-label-sm text-on-surface-variant uppercase">Keterangan (opsional)</label>
            <textarea id="kendala-note" maxLength={MAX_NOTE} value={note} onChange={e => setNote(e.target.value)} placeholder="Contoh: baterai tinggal 5%, perlu pengganti"
              className="bg-surface-container-low border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary p-sm min-h-[80px] resize-none" />
            <span className="text-[11px] text-on-surface-variant self-end">{note.length}/{MAX_NOTE}</span>
          </div>
        </div>
        <div className="p-md bg-surface-container-lowest border-t border-surface-variant flex gap-md">
          <button onClick={close} className="flex-1 py-3 rounded-xl border border-outline text-on-surface font-label-sm hover:bg-surface-container-low">Batal</button>
          <button onClick={submit} disabled={!reason || sending} className="flex-[2] py-3 rounded-xl bg-orange-500 text-white font-label-sm flex items-center justify-center gap-sm shadow-sm disabled:opacity-60">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
            {sending ? 'Mengirim...' : 'Kirim Kendala'}
          </button>
        </div>
      </div>
    </div>
  );
}
