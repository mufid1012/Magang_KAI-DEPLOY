'use client';
import { legacyReplayUrl } from '../lib/legacyReplay';

import { useEffect,useRef,useState } from 'react';
import { getOfflineQueue,removeFromOfflineQueue } from '../lib/offline-store';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const syncing = useRef(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    // Determine initial state safely
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);

      const handleOnline = () => {
        setIsOnline(true);
        syncOfflineData();
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Attempt to sync immediately if we start online
      if (navigator.onLine) {
        syncOfflineData();
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const syncOfflineData = async () => {
    if (syncing.current) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    syncing.current = true;
    setSyncStatus('Memeriksa data tertunda...');

    try {
      const queue = await getOfflineQueue();
      if (queue.length === 0) {
        setSyncStatus(null);
        syncing.current = false;
        return;
      }

      setSyncStatus(`Mensinkronkan ${queue.length} antrean data...`);

      for (const item of queue) {
        if (!item.id) continue;
        if (localStorage.getItem('token') !== token) break;
        const target = legacyReplayUrl(item.url,item.headers,token,process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api',window.location.origin);
        if (!target) continue;

        try {
          // Perform the actual fetch request
          const response = await fetch(target, {
            method: item.method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(item.body),
          });

          if (response.ok) {
            // Remove from queue if successful
            await removeFromOfflineQueue(item.id);
          } else {
            console.error(`Gagal sinkronisasi data dengan ID: ${item.id}`, await response.text());
          }
        } catch (error) {
          console.error(`Network error saat sinkronisasi data ID: ${item.id}`, error);
          // If network error, stop syncing for now to try again later
          break;
        }
      }

      const remaining = await getOfflineQueue();
      if (remaining.length === 0) {
        setSyncStatus('Sinkronisasi selesai');
        setTimeout(() => setSyncStatus(null), 3000);
      } else {
        setSyncStatus(`Ada ${remaining.length} data versi lama yang belum dikirim. Periksa koneksi dan sesi akun terkait.`);
      }
    } catch (error) {
      console.error('Error in offline sync process', error);
      setSyncStatus('Terjadi kesalahan saat sinkronisasi');
    } finally {
      syncing.current = false;
    }
  };

  return { isOnline, syncStatus };
}
