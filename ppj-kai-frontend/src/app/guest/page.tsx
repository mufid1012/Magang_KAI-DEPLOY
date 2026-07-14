'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const GuestMap = dynamic(() => import('../../components/map/GuestMap'), { ssr: false });

export default function GuestPage() {
  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-5 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo-kai.png" alt="KAI Logo" className="h-7 w-auto object-contain" />
          <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="font-extrabold text-slate-800 tracking-tight text-sm hidden sm:block">
            <span className="text-primary">DAOP 6 Yogyakarta</span>
          </h1>
          <span className="ml-1 px-2 py-0.5 bg-slate-500 text-white font-bold text-[9px] rounded uppercase tracking-widest shadow-sm">
            Guest
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            <span className="hidden sm:inline">Mode Publik</span>
          </div>
          <Link
            href="/login"
            className="px-3.5 py-1.5 bg-primary text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            Masuk
          </Link>
        </div>
      </header>

      {/* ── Full-screen Map ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden relative isolate">
        <GuestMap />

        {/* ── Badge: DAOP 6 identifier (top-right) ──────────────────────── */}
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm border border-slate-200 flex items-center gap-2 z-[1000]">
          <span className="material-symbols-outlined text-primary text-[16px]">train</span>
          <span className="text-slate-600 text-[10px] font-bold tracking-widest uppercase">DAOP 6 Yogyakarta</span>
        </div>

        {/* ── Route info panel (bottom-left) ─────────────────────────────── */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-md border border-slate-200 z-[1000]">
          <p className="text-slate-500 uppercase font-bold text-[9px] tracking-widest mb-2">Wilayah Jalur</p>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-1 rounded-full bg-[#005bac]"></div>
            <span className="text-slate-700 text-[11px] font-semibold">Sta. Jenar — Sta. Kedungbanteng</span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1.5 font-medium">14 stasiun · Jalur utama DAOP 6</p>
        </div>
      </main>
    </div>
  );
}
