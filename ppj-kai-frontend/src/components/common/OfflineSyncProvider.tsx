'use client';
import React from 'react';
import { useOfflineSync } from '../../hooks/useOfflineSync';

export default function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { isOnline, syncStatus } = useOfflineSync();

  return (
    <>
      {/* Offline/Sync Banner Indicator */}
      {!isOnline && (
        <div className="fixed top-0 left-0 w-full z-[100] bg-error text-on-error px-4 py-1 text-center font-label-sm text-[10px] uppercase font-bold animate-pulse">
          Offline — jejak GPS disimpan lokal. Sambungkan internet untuk mengirim laporan.
        </div>
      )}
      {isOnline && syncStatus && (
        <div className="fixed top-0 left-0 w-full z-[100] bg-primary text-on-primary px-4 py-1 text-center font-label-sm text-[10px] uppercase">
          {syncStatus}
        </div>
      )}
      {children}
    </>
  );
}
