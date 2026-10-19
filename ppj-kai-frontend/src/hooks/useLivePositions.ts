'use client';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { VisiblePoller } from '../lib/visiblePoller';
import type { LivePosition } from '../components/admin/types';
export function useLivePositions(enabled: boolean) {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const poller = new VisiblePoller(() => document.visibilityState === 'visible' && !!localStorage.getItem('token'), async signal => {
      try {
        const res = await api.get('/admin/live-positions', { signal, timeout: 12000 });
        if (!disposed && !signal.aborted) { setPositions(res.data.data); setError(''); }
      } catch (e) { if (!disposed && !signal.aborted) setError('Monitoring gagal diperbarui; periksa waktu sampel.'); throw e; }
    });
    const change = () => poller.visibilityChanged();
    document.addEventListener('visibilitychange', change); void poller.poll();
    return () => { disposed = true; poller.stop(); document.removeEventListener('visibilitychange', change); };
  }, [enabled]);
  return { positions, error };
}
