'use client';
import { useEffect,useState } from 'react';
import { validSampleShape } from '../../../shared/telemetry';
export interface GPSReading { lat: number; lng: number; accuracy: number; timestamp: number; speed: number | null }

// The Android app (ppj-kai-mobile) loads this site and injects window.Capacitor with its native plugins.
interface NativeLocation { latitude: number; longitude: number; accuracy: number; speed: number | null; time: number | null }
interface BackgroundGeolocation {
  addWatcher(options: Record<string, unknown>, callback: (location?: NativeLocation, error?: { code?: string; message?: string }) => void): string | Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}
// The injected bridge exposes native plugins on Capacitor.Plugins (registerPlugin lives in @capacitor/core, not loaded here).
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { BackgroundGeolocation?: BackgroundGeolocation } };
const capacitor = () => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor);
const WATCHER_KEY = 'ppj_native_gps_watcher';
/** True inside the PPJ Android app, where GPS keeps running with the screen off. */
export const isNativeApp = () => !!capacitor()?.isNativePlatform?.();

export function useGPS() {
  const [position, setPosition] = useState<GPSReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const accept = (lat: number, lng: number, accuracy: number, timestamp: number, rawSpeed: number | null | undefined) => {
      const speed = typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) ? rawSpeed : null;
      if (!validSampleShape({ id: 'gps', capturedAt: timestamp, lat, lng, accuracy, deviceSpeed: speed })) { setError('Posisi GPS tidak valid'); return; }
      setError(null);
      setPosition({ lat, lng, accuracy, timestamp, speed });
    };

    const plugin = isNativeApp() ? capacitor()?.Plugins?.BackgroundGeolocation : undefined;
    if (plugin) {
      // Foreground service with a notification: Android keeps delivering fixes with the screen off.
      let disposed = false, watcherId: string | null = null;
      // A page reload skips React cleanup and the native watcher outlives it (GPS + notification stay on).
      // sessionStorage survives the reload, so the leftover watcher is removed here.
      const remember = (id: string | null) => { try { if (id) sessionStorage.setItem(WATCHER_KEY, id); else sessionStorage.removeItem(WATCHER_KEY); } catch { /* storage blocked */ } };
      try { const stale = sessionStorage.getItem(WATCHER_KEY); if (stale) void plugin.removeWatcher({ id: stale }).catch(() => {}); } catch { /* storage blocked */ }
      const watcher = plugin.addWatcher({
        backgroundTitle: 'Tracking inspeksi PPJ aktif',
        backgroundMessage: 'Lokasi tetap dicatat walau layar mati.',
        requestPermissions: true, stale: false, distanceFilter: 0,
      }, (location, err) => {
        if (err) { setError(err.code === 'NOT_AUTHORIZED' ? 'Izin lokasi ditolak. Aktifkan izin lokasi aplikasi PPJ KAI di pengaturan HP.' : err.message || 'GPS bermasalah'); return; }
        if (location) accept(location.latitude, location.longitude, location.accuracy, location.time ?? Date.now(), location.speed);
      });
      Promise.resolve(watcher).then(id => { if (disposed) void plugin.removeWatcher({ id }); else { watcherId = id; remember(id); } })
        .catch(() => setError('GPS aplikasi tidak dapat dimulai'));
      return () => { disposed = true; if (watcherId) { void plugin.removeWatcher({ id: watcherId }); remember(null); } };
    }

    if (!navigator.geolocation) { setError('GPS tidak didukung browser ini'); return; }
    const watch = navigator.geolocation.watchPosition(
      pos => accept(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp, pos.coords.speed),
      err => setError(err.message), { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, []);
  return { position, error };
}
