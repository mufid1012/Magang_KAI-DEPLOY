'use client';
import { useEffect,useRef,useState } from 'react';
export function useGPS() {
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number; timestamp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setError('GPS tidak didukung browser ini'); return; }

    // Try high accuracy first
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp });
      },
      (err) => {
        // If high accuracy fails, try with lower accuracy as fallback
        if (err.code === err.TIMEOUT && watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current);
          watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              setError(null);
              setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, timestamp: pos.timestamp });
            },
            (err2) => setError(err2.message),
            { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 }
          );
        } else {
          setError(err.message);
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  return { position, error };
}
