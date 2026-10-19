'use client';
import { useEffect } from 'react';
export function usePolling(refresh: () => Promise<unknown>, intervalMs: number) {
  useEffect(() => {
    let running = false, disposed = false;
    const poll = async () => { if (running || disposed) return; running = true; try { await refresh(); } catch(error) { console.error('Polling failed:', error); } finally { running = false; } };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, intervalMs);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [refresh, intervalMs]);
}
