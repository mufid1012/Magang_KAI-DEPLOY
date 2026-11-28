'use client';
import { useEffect, useState, type ReactNode } from 'react';

const MOBILE = '(max-width: 767px)';

/**
 * Map overlay that starts closed on phones (so the map stays visible) and open on desktop.
 * Closed, it is a 40 px round button; open, the panel keeps its own card styling plus a close button.
 */
export default function CollapsiblePanel({ title, icon, children, className = '' }: {
  title: string; icon: string; children: ReactNode; className?: string;
}) {
  const [mobile, setMobile] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia(MOBILE);
    const sync = () => setMobile(query.matches);
    sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const open = choice ?? !mobile;

  if (!open) {
    return (
      <div className={className}>
        <button type="button" onClick={() => setChoice(true)} aria-expanded={false} aria-label={`Buka ${title}`} title={title}
          className="w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </button>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="relative">
      {children}
      <button type="button" onClick={() => setChoice(false)} aria-expanded={true} aria-label={`Tutup ${title}`} title={`Tutup ${title}`}
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100">
        <span className="material-symbols-outlined text-[18px]">expand_more</span>
      </button>
      </div>
    </div>
  );
}
