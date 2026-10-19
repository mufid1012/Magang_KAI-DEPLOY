'use client';
import { useEffect,useState } from 'react';
import { validSampleShape } from '../../../shared/telemetry';
export interface GPSReading { lat: number; lng: number; accuracy: number; timestamp: number; speed: number | null }
export function useGPS() {
  const [position, setPosition] = useState<GPSReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) { setError('GPS tidak didukung browser ini'); return; }
    const watch = navigator.geolocation.watchPosition(pos => {
      if (!validSampleShape({id: 'gps', capturedAt: pos.timestamp, lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy, deviceSpeed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null})) {
        setError('Posisi GPS tidak valid'); return;
      }
      setError(null);
      setPosition({lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp, speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null});
    }, err => setError(err.message), { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, []);
  return { position, error };
}
