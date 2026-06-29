'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import api from '../../lib/api';

const DynamicMap = dynamic(() => import('../map/DynamicMap'), { ssr: false });

// GPS Hook with improved accuracy and reliability
function useGPS() {
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setError('GPS tidak didukung browser ini'); return; }

    // Try high accuracy first
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      (err) => {
        // If high accuracy fails, try with lower accuracy as fallback
        if (err.code === err.TIMEOUT && watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current);
          watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              setError(null);
              setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
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

interface TabTrackingProps {
  tugasId: number | null;
  onFinish: () => void;
  onBack: () => void;
}

export default function TabTracking({ tugasId, onFinish, onBack }: TabTrackingProps) {
  const { position: gpsPos, error: gpsError } = useGPS();

  const [status, setStatus] = useState<'pending' | 'active'>('pending');
  const [tugas, setTugas] = useState<any>(null);
  const [trackingId, setTrackingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackPath, setTrackPath] = useState<[number, number][]>([]);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Identity Verification
  const [isVerified, setIsVerified] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Emergency Modal
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [jenisTemuan, setJenisTemuan] = useState('ringan');
  const [deskripsi, setDeskripsi] = useState('');
  const [isSubmittingLaporan, setIsSubmittingLaporan] = useState(false);
  const [emergencyPhoto, setEmergencyPhoto] = useState<string | null>(null);
  const [emergencyCameraActive, setEmergencyCameraActive] = useState(false);
  const emergencyVideoRef = useRef<HTMLVideoElement>(null);
  const emergencyStreamRef = useRef<MediaStream | null>(null);

  // Card minimize state
  const [cardMinimized, setCardMinimized] = useState(false);

  // Stop Confirmation Modal
  const [showStopModal, setShowStopModal] = useState(false);
  const [endVerified, setEndVerified] = useState(false);
  const [endSelfieDataUrl, setEndSelfieDataUrl] = useState<string | null>(null);
  const endVideoRef = useRef<HTMLVideoElement>(null);
  const endStreamRef = useRef<MediaStream | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  // Dev test mode — bypass geofencing (localhost only)
  const [testMode, setTestMode] = useState(false);
  const isDevEnv = typeof window !== 'undefined' && window.location.hostname === 'localhost';

  // localStorage key for persisting tracking session
  const STORAGE_KEY = tugasId ? `tracking_session_${tugasId}` : '';

  useEffect(() => {
    if (tugasId) fetchTugasDetail();
    else setLoading(false);
  }, [tugasId]);

  // Track GPS path when active, persist to localStorage
  useEffect(() => {
    if (status === 'active' && gpsPos) {
      setTrackPath(prev => {
        const updated: [number, number][] = [...prev, [gpsPos.lat, gpsPos.lng]];
        // Update localStorage path (throttle: only every 5 points to reduce writes)
        if (updated.length % 5 === 0) {
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const session = JSON.parse(saved);
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, trackPath: updated }));
            }
          } catch { /* ignore */ }
        }
        return updated;
      });
    }
  }, [gpsPos, status]);

  // Timer tick
  useEffect(() => {
    if (status === 'active') {
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const fetchTugasDetail = async () => {
    if (!tugasId) return;
    try {
      setLoading(true);
      const res = await api.get(`/tugas/${tugasId}`);
      const data = res.data.data;
      setTugas(data);

      // If already completed, go to history
      if (data?.status === 'completed') {
        onFinish();
        return;
      }

      // If tugas is in_progress, ALWAYS try to restore tracking from backend
      if (data?.status === 'in_progress') {
        const trackRes = await api.get(`/tracking/active/${tugasId}`).catch(() => null);
        if (trackRes?.data?.trackingId) {
          // Use backend startTime as authoritative source for elapsed time
          const backendStartTime = trackRes.data.startTime
            ? new Date(trackRes.data.startTime).getTime()
            : Date.now();
          const secondsElapsed = Math.floor((Date.now() - backendStartTime) / 1000);

          setTrackingId(trackRes.data.trackingId);
          setStatus('active');
          setElapsed(secondsElapsed > 0 ? secondsElapsed : 0);
          setIsVerified(true);

          // Try to restore path from localStorage (optional bonus)
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const session = JSON.parse(saved);
              if (Array.isArray(session.trackPath) && session.trackPath.length > 0) {
                setTrackPath(session.trackPath);
              }
            }
          } catch { /* path will just restart from current position */ }
        }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleStartTracking = async () => {
    if (!isVerified) { setVerifyModalOpen(true); return; }
    if (!gpsPos) { alert('Menunggu sinyal GPS...'); return; }
    try {
      const res = await api.post(`/tracking/start/${tugasId}`, { lat: gpsPos.lat, lng: gpsPos.lng });
      const newTrackingId = res.data.trackingId;
      const startedAt = Date.now();
      const initialPath: [number, number][] = [[gpsPos.lat, gpsPos.lng]];

      setTrackingId(newTrackingId);
      setStatus('active');
      setElapsed(0);
      setTrackPath(initialPath);

      // Persist session to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        trackingId: newTrackingId,
        startedAt,
        trackPath: initialPath,
      }));
    } catch (err) {
      console.error('Failed to start tracking', err);
      alert('Gagal memulai inspeksi.');
    }
  };

  const handleStopTracking = async () => {
    if (!trackingId) return;
    // Use GPS position, or fallback to last known track point
    const stopLat = gpsPos?.lat ?? (trackPath.length > 0 ? trackPath[trackPath.length - 1][0] : null);
    const stopLng = gpsPos?.lng ?? (trackPath.length > 0 ? trackPath[trackPath.length - 1][1] : null);
    if (stopLat === null || stopLng === null) { alert('Tidak ada posisi GPS yang tersedia.'); return; }
    try {
      setIsStopping(true);
      await api.post(`/tracking/stop/${trackingId}`, { lat: stopLat, lng: stopLng });
      if (timerRef.current) clearInterval(timerRef.current);
      localStorage.removeItem(STORAGE_KEY); // Clear persisted session
      onFinish();
    } catch (err) {
      console.error('Failed to stop tracking', err);
      alert('Gagal menghentikan inspeksi.');
    } finally {
      setIsStopping(false);
    }
  };

  const handleKirimLaporan = async () => {
    if (!trackingId || !gpsPos) { alert('Tracking belum aktif atau GPS belum tersedia.'); return; }
    try {
      setIsSubmittingLaporan(true);
      await api.post(`/laporan`, {
        trackingId,
        jenisTemuan,
        deskripsi,
        lat: gpsPos.lat,
        lng: gpsPos.lng,
        fotoUrl: emergencyPhoto || '',
      });
      alert('Laporan berhasil dikirim!');
      setIsEmergencyModalOpen(false);
      setDeskripsi('');
      setEmergencyPhoto(null);
    } catch (err) {
      console.error('Failed to send laporan', err);
      alert('Gagal mengirim laporan darurat.');
    } finally { setIsSubmittingLaporan(false); }
  };

  // Emergency camera functions
  const openEmergencyCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      emergencyStreamRef.current = stream;
      setEmergencyCameraActive(true);
      setTimeout(() => {
        if (emergencyVideoRef.current) {
          emergencyVideoRef.current.srcObject = stream;
          emergencyVideoRef.current.play();
        }
      }, 100);
    } catch { alert('Tidak dapat mengakses kamera.'); }
  };

  const captureEmergencyPhoto = () => {
    if (!emergencyVideoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = emergencyVideoRef.current.videoWidth;
    canvas.height = emergencyVideoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(emergencyVideoRef.current, 0, 0);
    setEmergencyPhoto(canvas.toDataURL('image/jpeg', 0.7));
    stopEmergencyCamera();
  };

  const stopEmergencyCamera = () => {
    emergencyStreamRef.current?.getTracks().forEach(t => t.stop());
    emergencyStreamRef.current = null;
    setEmergencyCameraActive(false);
  };

  // Camera functions for Identity Verification
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { alert('Tidak dapat mengakses kamera.'); }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.7));
    stopCamera();
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const confirmVerification = () => {
    if (!selfieDataUrl) { alert('Silakan ambil foto terlebih dahulu.'); return; }
    setIsVerified(true);
    setVerifyModalOpen(false);
  };

  // End verification camera functions
  const openEndCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      endStreamRef.current = stream;
      setTimeout(() => {
        if (endVideoRef.current) { endVideoRef.current.srcObject = stream; endVideoRef.current.play(); }
      }, 100);
    } catch { alert('Tidak dapat mengakses kamera.'); }
  };

  const captureEndPhoto = () => {
    if (!endVideoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = endVideoRef.current.videoWidth;
    canvas.height = endVideoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(endVideoRef.current, 0, 0);
    setEndSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.7));
    stopEndCamera();
  };

  const stopEndCamera = () => {
    endStreamRef.current?.getTracks().forEach(t => t.stop());
    endStreamRef.current = null;
  };

  const confirmEndVerification = () => {
    if (!endSelfieDataUrl) { alert('Silakan ambil foto terlebih dahulu.'); return; }
    setEndVerified(true);
  };

  const formatTime = (s: number) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${ss}`;
  };

  // Haversine distance in meters
  const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const GEOFENCE_RADIUS = 500; // meters

  // Calculate total distance traveled from trackPath
  const totalDistanceM = trackPath.reduce((sum, point, i) => {
    if (i === 0) return 0;
    return sum + haversineM(trackPath[i - 1][0], trackPath[i - 1][1], point[0], point[1]);
  }, 0);
  const totalDistanceKm = (totalDistanceM / 1000).toFixed(2);

  const distanceToStart = gpsPos && tugas
    ? haversineM(gpsPos.lat, gpsPos.lng, tugas.startPointLat, tugas.startPointLong)
    : null;
  const routeKm = tugas
    ? (haversineM(tugas.startPointLat, tugas.startPointLong, tugas.endPointLat, tugas.endPointLong) / 1000).toFixed(1)
    : null;
  const withinGeofence = testMode || (distanceToStart !== null && distanceToStart <= GEOFENCE_RADIUS);

  // End point geofence
  const distanceToEnd = gpsPos && tugas
    ? haversineM(gpsPos.lat, gpsPos.lng, tugas.endPointLat, tugas.endPointLong)
    : null;
  const withinEndGeofence = testMode || (distanceToEnd !== null && distanceToEnd <= GEOFENCE_RADIUS);

  // No tugas selected
  if (!tugasId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-container-padding py-20">
        <div className="flex flex-col items-center text-center max-w-sm">
          <div className="w-28 h-28 rounded-full bg-surface-container flex items-center justify-center mb-lg">
            <span className="material-symbols-outlined text-[56px] text-outline">map</span>
          </div>
          <h2 className="font-h2 text-h2 font-bold text-on-surface mb-sm">Pilih Tugas Terlebih Dahulu</h2>
          <p className="font-body-md text-on-surface-variant mb-lg leading-relaxed">
            Silakan pilih tugas dari tab Penjadwalan untuk memulai tracking inspeksi.
          </p>
          <button
            onClick={onBack}
            className="px-lg py-sm bg-primary text-on-primary rounded-xl font-label-sm flex items-center gap-xs shadow-sm active:scale-[0.97] transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Ke Penjadwalan
          </button>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-md text-on-surface-variant">
        <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
        <p className="font-body-md">Memuat data tugas...</p>
      </div>
    </div>
  );

  const mapLat = gpsPos?.lat ?? -6.1754;
  const mapLng = gpsPos?.lng ?? 106.8272;

  return (
    <div className="bg-surface text-on-surface font-body-lg h-full w-full overflow-hidden flex flex-col relative selection:bg-primary-container selection:text-on-primary-container">
      {/* Live Map Background */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <DynamicMap
          lat={mapLat}
          lng={mapLng}
          zoom={status === 'pending' ? 13 : 17}
          trackPath={status === 'active' ? trackPath : undefined}
          routeStart={tugas ? { lat: tugas.startPointLat, lng: tugas.startPointLong, name: tugas.startPointName } : undefined}
          routeEnd={tugas ? { lat: tugas.endPointLat, lng: tugas.endPointLong, name: tugas.endPointName } : undefined}
        />
      </div>

      {/* Back button overlay */}
      <div className="absolute top-4 left-4 z-50">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-surface/90 backdrop-blur-md shadow-md flex items-center justify-center text-primary hover:bg-surface active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      {/* Title overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-surface/90 backdrop-blur-md rounded-full px-md py-xs shadow-md">
          <h1 className="font-label-sm text-label-sm text-primary font-bold tracking-tight whitespace-nowrap">
            {status === 'pending' ? (tugas?.jalur || 'RailTrack PPJ') : 'Inspeksi Berlangsung'}
          </h1>
        </div>
      </div>

      <main className="flex-1 w-full relative z-10 pointer-events-none">
        {status === 'pending' ? (
          /* Pre-Start Card — collapsible */
          <div className="absolute bottom-4 left-0 w-full px-container-padding pointer-events-auto">
            <div className="bg-surface/90 backdrop-blur-xl rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.08)] border border-surface-variant flex flex-col w-full max-w-3xl mx-auto overflow-hidden">
              {/* Card Header — always visible */}
              <div className="flex items-center justify-between p-md">
                <div className="flex items-center gap-sm">
                  <h2 className="font-h3 text-h3 text-on-surface">Inspection Setup</h2>
                  <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm px-2 py-1 rounded-full uppercase tracking-wider">Pending</span>
                </div>
                <button
                  onClick={() => setCardMinimized(m => !m)}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant"
                  title={cardMinimized ? 'Perluas' : 'Perkecil'}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {cardMinimized ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </div>

              {/* Card Body — collapsible */}
              {!cardMinimized && (
                <div className="flex flex-col gap-md px-md pb-md">
              <div className="flex flex-col gap-sm">
                {/* GPS Status */}
                <div className={`flex items-center gap-md p-sm rounded-lg border ${gpsPos ? 'bg-surface-container-low border-outline-variant/30' : 'bg-error-container/20 border-error/30'}`}>
                  <span className="material-symbols-outlined text-primary" style={gpsPos ? { fontVariationSettings: "'FILL' 1" } : {}}>
                    {gpsPos ? 'check_circle' : 'gps_off'}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md text-on-surface font-semibold">
                      {gpsPos ? 'GPS Location Locked' : (gpsError || 'Mencari sinyal GPS...')}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {gpsPos ? `Accuracy: ±${Math.round(gpsPos.accuracy)}m` : 'Pastikan GPS diaktifkan'}
                    </span>
                  </div>
                </div>

                {/* Identity Verification */}
                <button
                  onClick={() => { setVerifyModalOpen(true); openCamera(); }}
                  className={`flex items-center justify-between p-sm rounded-lg border transition-colors focus:outline-none ${isVerified ? 'bg-surface-container-low border-outline-variant/30' : 'bg-surface-container-low hover:bg-surface-container border-error-container/50'}`}
                >
                  <div className="flex items-center gap-md">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isVerified ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-on-error-container'}`}>
                      <span className="material-symbols-outlined text-sm">{isVerified ? 'check' : 'photo_camera'}</span>
                    </div>
                    <span className="font-body-md text-body-md text-on-surface">Identity Verification</span>
                  </div>
                  {isVerified ? (
                    <span className="text-primary font-label-sm text-label-sm uppercase flex items-center gap-xs">Verified ✓</span>
                  ) : (
                    <span className="text-error font-label-sm text-label-sm uppercase flex items-center gap-xs">
                      Required <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </span>
                  )}
                </button>
              </div>

              {/* Route Info */}
              {tugas && (
                <div className="bg-surface-container-low rounded-lg p-sm flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
                  <div className="flex-1">
                    <p className="font-label-sm text-[11px] text-on-surface-variant uppercase">Jarak Jalur</p>
                    <p className="font-data-heavy text-on-surface">{routeKm} km</p>
                    <p className="font-label-sm text-[10px] text-on-surface-variant">{tugas.startPointName} → {tugas.endPointName}</p>
                  </div>
                </div>
              )}

              {/* Geofencing Distance */}
              {distanceToStart !== null && (
                <div className={`rounded-lg p-sm border ${withinGeofence ? 'bg-primary-container/10 border-primary/30' : 'bg-error-container/10 border-error/20'}`}>
                  <div className="flex items-center justify-between mb-xs">
                    <span className="font-label-sm text-[11px] text-on-surface-variant uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">{withinGeofence ? 'location_on' : 'near_me'}</span>
                      Jarak ke Titik Awal
                    </span>
                    <span className={`font-label-sm text-[11px] font-bold ${withinGeofence ? 'text-primary' : 'text-error'}`}>
                      {distanceToStart < 1000 ? `${Math.round(distanceToStart)}m` : `${(distanceToStart/1000).toFixed(1)}km`}
                    </span>
                  </div>
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${withinGeofence ? 'bg-primary' : 'bg-error'}`}
                      style={{ width: `${Math.min(100, (GEOFENCE_RADIUS / Math.max(distanceToStart, 1)) * 100)}%` }}
                    />
                  </div>
                  <p className={`font-label-sm text-[10px] mt-xs ${withinGeofence ? 'text-primary' : 'text-error'}`}>
                    {withinGeofence ? '✓ Anda sudah berada di lokasi, siap mulai!' : `Menuju titik awal, sisa ${GEOFENCE_RADIUS} meter`}
                  </p>
                </div>
              )}

              {/* Test Mode Toggle — localhost only */}
              {isDevEnv && (
                <button
                  onClick={() => setTestMode(m => !m)}
                  className={`flex items-center justify-between p-sm rounded-lg border transition-colors ${
                    testMode
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-600'
                      : 'bg-surface-container border-outline-variant text-on-surface-variant'
                  }`}
                >
                  <span className="flex items-center gap-sm font-label-sm text-[11px]">
                    <span className="material-symbols-outlined text-[16px]">science</span>
                    Mode Testing (bypass geofencing)
                  </span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors ${testMode ? 'bg-amber-500' : 'bg-outline-variant'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${testMode ? 'left-4' : 'left-0.5'}`} />
                  </span>
                </button>
              )}

              <button
                onClick={handleStartTracking}
                disabled={!gpsPos || !withinGeofence}
                className={`w-full text-on-primary font-body-lg font-semibold h-[48px] rounded-lg flex items-center justify-center gap-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                  testMode ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-surface-tint'
                }`}
              >
                <span className="material-symbols-outlined">play_circle</span>
                {!gpsPos
                  ? 'Menunggu GPS...'
                  : testMode
                  ? 'Mulai Tracking (Test Mode)'
                  : !withinGeofence
                  ? `Mendekat ke Titik Awal (${Math.round(distanceToStart ?? 0)}m)`
                  : 'Mulai Tracking'
                }
              </button>
              </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Emergency FAB */}
            <div className="absolute right-container-padding bottom-[240px] pointer-events-auto">
              <button onClick={() => setIsEmergencyModalOpen(true)} className="w-16 h-16 bg-error text-on-error rounded-full shadow-[0px_8px_24px_rgba(186,26,26,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95">
                <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              </button>
            </div>
            {/* Active Tracking Panel */}
            <div className="bg-white rounded-t-[32px] shadow-[0px_-8px_24px_rgba(0,0,0,0.08)] px-lg pt-lg pb-[100px] fixed bottom-0 left-0 right-0 z-40 pointer-events-auto">
              <div className="flex justify-between items-center mb-lg px-md">
                <div className="flex flex-col items-center">
                  <div className="text-on-surface-variant font-label-sm uppercase text-[10px] mb-1">Duration</div>
                  <div className="text-on-surface font-h2 font-bold">{formatTime(elapsed)}</div>
                </div>
                <div className="w-px h-8 bg-outline-variant/30" />
                <div className="flex flex-col items-center">
                  <div className="text-on-surface-variant font-label-sm uppercase text-[10px] mb-1">Jarak</div>
                  <div className="text-on-surface font-h2 font-bold">{totalDistanceKm}<span className="text-[12px] font-normal ml-0.5">km</span></div>
                </div>
                <div className="w-px h-8 bg-outline-variant/30" />
                <div className="flex flex-col items-center">
                  <div className="text-on-surface-variant font-label-sm uppercase text-[10px] mb-1">Accuracy</div>
                  <div className="text-on-surface font-h2 font-bold">±{gpsPos ? Math.round(gpsPos.accuracy) : '-'}m</div>
                </div>
              </div>
              <div className="flex gap-md items-center">
                <button onClick={() => setShowStopModal(true)} className="flex-1 bg-error text-on-error rounded-full h-[56px] flex items-center justify-center gap-sm font-h3 shadow-lg active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop_circle</span>
                  Selesai
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Identity Verification Modal */}
      {verifyModalOpen && (
        <div className="fixed inset-0 z-[60] bg-on-surface/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 pointer-events-auto">
          <div className="bg-surface w-full max-w-lg rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-primary px-md py-sm flex items-center justify-between">
              <h3 className="font-h3 text-h3 text-on-primary flex items-center gap-sm">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span> Verifikasi Identitas
              </h3>
              <button onClick={() => { setVerifyModalOpen(false); stopCamera(); }} className="text-on-primary/80 hover:text-on-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-md flex flex-col gap-md">
              {/* Camera preview or captured photo */}
              {!selfieDataUrl ? (
                <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                    <button onClick={capturePhoto} className="w-16 h-16 bg-white rounded-full border-4 border-primary shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                      <span className="material-symbols-outlined text-primary text-[32px]">photo_camera</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden">
                  <img src={selfieDataUrl} alt="Selfie" className="w-full h-full object-cover" />
                  <button onClick={() => { setSelfieDataUrl(null); openCamera(); }} className="absolute top-2 right-2 bg-surface/80 backdrop-blur-sm rounded-full p-1.5">
                    <span className="material-symbols-outlined text-error">refresh</span>
                  </button>
                </div>
              )}
              {/* GPS info */}
              <div className="flex items-center gap-sm p-sm bg-surface-container-low rounded-lg">
                <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {gpsPos ? `${gpsPos.lat.toFixed(6)}, ${gpsPos.lng.toFixed(6)} (±${Math.round(gpsPos.accuracy)}m)` : 'Menunggu GPS...'}
                </span>
              </div>
            </div>
            <div className="p-md bg-surface-container-lowest border-t border-surface-variant flex gap-md">
              <button onClick={() => { setVerifyModalOpen(false); stopCamera(); setSelfieDataUrl(null); }} className="flex-1 py-3 rounded-xl border border-outline text-on-surface font-label-sm hover:bg-surface-container-low">
                Batal
              </button>
              <button onClick={confirmVerification} disabled={!selfieDataUrl} className="flex-[2] py-3 rounded-xl bg-primary text-on-primary font-label-sm flex items-center justify-center gap-sm shadow-sm disabled:opacity-50">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check</span> Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Modal */}
      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-[60] bg-on-surface/50 backdrop-blur-sm flex flex-col items-center justify-end md:justify-center p-0 md:p-container-padding pointer-events-auto">
          <div className="bg-surface w-full max-w-lg rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-error px-md py-sm flex items-center justify-between">
              <h3 className="font-h3 text-h3 text-on-error flex items-center gap-sm">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span> Lapor Kendala Darurat
              </h3>
              <button onClick={() => { setIsEmergencyModalOpen(false); stopEmergencyCamera(); setEmergencyPhoto(null); }} className="text-on-error/80 hover:text-on-error"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-md flex flex-col gap-md max-h-[60vh] overflow-y-auto">
              <div className="flex flex-col gap-xs">
                <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Kategori Kendala</label>
                <div className="grid grid-cols-2 gap-sm">
                  {[
                    { key: 'berat', icon: 'construction', label: 'Baut Lepas', color: 'error' },
                    { key: 'emergency', icon: 'broken_image', label: 'Rel Retak', color: 'error' },
                    { key: 'sedang', icon: 'block', label: 'Penghalang', color: 'primary' },
                    { key: 'ringan', icon: 'more_horiz', label: 'Lainnya', color: 'primary' },
                  ].map(c => (
                    <button key={c.key} onClick={() => setJenisTemuan(c.key)}
                      className={`flex flex-col items-center justify-center p-md rounded-xl border-2 transition-colors active:scale-95 ${jenisTemuan === c.key ? `border-${c.color} bg-${c.color}-container/20 text-${c.color}` : 'border-outline-variant bg-surface-container-lowest text-on-surface'}`}>
                      <span className="material-symbols-outlined text-h1" style={jenisTemuan === c.key ? { fontVariationSettings: "'FILL' 1" } : {}}>{c.icon}</span>
                      <span className="font-label-sm text-label-sm text-center">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Deskripsi Kendala</label>
                <textarea className="bg-surface-container-low border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary p-sm min-h-[80px] resize-none" placeholder="Jelaskan detail kendala..." value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
              </div>

              {/* Photo Section */}
              <div className="flex flex-col gap-xs">
                <label className="font-label-sm text-label-sm text-on-surface-variant uppercase">Foto Kondisi Darurat</label>
                {emergencyCameraActive ? (
                  <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
                    <video ref={emergencyVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-md">
                      <button onClick={captureEmergencyPhoto} className="w-14 h-14 bg-error rounded-full border-4 border-white shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-white text-[28px]">photo_camera</span>
                      </button>
                      <button onClick={stopEmergencyCamera} className="w-10 h-10 bg-surface/80 backdrop-blur rounded-full flex items-center justify-center self-center">
                        <span className="material-symbols-outlined text-error text-[20px]">close</span>
                      </button>
                    </div>
                  </div>
                ) : emergencyPhoto ? (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-outline-variant">
                    <img src={emergencyPhoto} alt="Foto darurat" className="w-full h-full object-cover" />
                    <button onClick={() => { setEmergencyPhoto(null); openEmergencyCamera(); }} className="absolute top-2 right-2 bg-surface/80 backdrop-blur-sm rounded-full p-1.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-error text-[18px]">refresh</span>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm p-xs text-center">
                      <span className="text-white font-label-sm text-[10px]">📍 {gpsPos ? `${gpsPos.lat.toFixed(5)}, ${gpsPos.lng.toFixed(5)}` : 'GPS tidak tersedia'}</span>
                    </div>
                  </div>
                ) : (
                  <button onClick={openEmergencyCamera} className="w-full h-24 rounded-xl border-2 border-dashed border-error/40 bg-error-container/10 flex flex-col items-center justify-center text-error hover:bg-error-container/20 transition-colors cursor-pointer gap-1">
                    <span className="material-symbols-outlined text-[32px]">add_a_photo</span>
                    <span className="font-label-sm text-label-sm">Ambil Foto Kondisi</span>
                  </button>
                )}
              </div>
            </div>
            <div className="p-md bg-surface-container-lowest border-t border-surface-variant flex gap-md">
              <button onClick={() => setIsEmergencyModalOpen(false)} className="flex-1 py-3 rounded-xl border border-outline text-on-surface font-label-sm hover:bg-surface-container-low">Batal</button>
              <button onClick={handleKirimLaporan} disabled={isSubmittingLaporan} className="flex-[2] py-3 rounded-xl bg-error text-on-error font-label-sm flex items-center justify-center gap-sm shadow-sm disabled:opacity-70">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                {isSubmittingLaporan ? 'Mengirim...' : 'Kirim Laporan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirmation Modal */}
      {showStopModal && (
        <div className="fixed inset-0 z-[60] bg-on-surface/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 pointer-events-auto">
          <div className="bg-surface w-full max-w-lg rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-error px-md py-sm flex items-center justify-between shrink-0">
              <h3 className="font-h3 text-h3 text-on-error flex items-center gap-sm">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>stop_circle</span> Selesai Inspeksi
              </h3>
              <button onClick={() => { setShowStopModal(false); stopEndCamera(); setEndSelfieDataUrl(null); setEndVerified(false); }} className="text-on-error/80 hover:text-on-error">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-md flex flex-col gap-md overflow-y-auto flex-1">
              {/* Summary */}
              <div className="bg-surface-container-low rounded-xl p-md space-y-sm">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Ringkasan Inspeksi</p>
                <div className="grid grid-cols-3 gap-sm">
                  <div className="flex flex-col items-center">
                    <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Durasi</span>
                    <span className="font-h3 text-on-surface font-bold">{formatTime(elapsed)}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Jarak</span>
                    <span className="font-h3 text-on-surface font-bold">{totalDistanceKm}<span className="text-[10px] font-normal ml-0.5">km</span></span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Akurasi</span>
                    <span className="font-h3 text-on-surface font-bold">±{gpsPos ? Math.round(gpsPos.accuracy) : '-'}m</span>
                  </div>
                </div>
              </div>

              {/* End Geofencing */}
              {distanceToEnd !== null && (
                <div className={`rounded-lg p-sm border ${withinEndGeofence ? 'bg-primary-container/10 border-primary/30' : 'bg-error-container/10 border-error/20'}`}>
                  <div className="flex items-center justify-between mb-xs">
                    <span className="font-label-sm text-[11px] text-on-surface-variant uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">{withinEndGeofence ? 'location_on' : 'near_me'}</span>
                      Jarak ke Titik Akhir
                    </span>
                    <span className={`font-label-sm text-[11px] font-bold ${withinEndGeofence ? 'text-primary' : 'text-error'}`}>
                      {distanceToEnd < 1000 ? `${Math.round(distanceToEnd)}m` : `${(distanceToEnd/1000).toFixed(1)}km`}
                    </span>
                  </div>
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${withinEndGeofence ? 'bg-primary' : 'bg-error'}`}
                      style={{ width: `${Math.min(100, (GEOFENCE_RADIUS / Math.max(distanceToEnd, 1)) * 100)}%` }}
                    />
                  </div>
                  <p className={`font-label-sm text-[10px] mt-xs ${withinEndGeofence ? 'text-primary' : 'text-error'}`}>
                    {withinEndGeofence ? '✓ Anda sudah berada di titik akhir inspeksi' : `Anda belum berada di titik akhir. Radius: ${GEOFENCE_RADIUS}m`}
                  </p>
                </div>
              )}

              {/* End Identity Verification */}
              <div className="flex flex-col gap-sm">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Verifikasi Identitas Akhir</p>
                {!endSelfieDataUrl ? (
                  <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden">
                    <video ref={endVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                      <button onClick={captureEndPhoto} className="w-16 h-16 bg-white rounded-full border-4 border-error shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-error text-[32px]">photo_camera</span>
                      </button>
                    </div>
                    {!endStreamRef.current && (
                      <button onClick={openEndCamera} className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container gap-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-[40px]">photo_camera</span>
                        <span className="font-label-sm text-label-sm">Tap untuk buka kamera</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden">
                    <img src={endSelfieDataUrl} alt="Selfie akhir" className="w-full h-full object-cover" />
                    <button onClick={() => { setEndSelfieDataUrl(null); setEndVerified(false); openEndCamera(); }} className="absolute top-2 right-2 bg-surface/80 backdrop-blur-sm rounded-full p-1.5">
                      <span className="material-symbols-outlined text-error">refresh</span>
                    </button>
                    <div className="absolute bottom-2 left-2 bg-primary/90 text-on-primary px-2 py-1 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check</span>
                      <span className="font-label-sm text-[10px]">Foto terverifikasi</span>
                    </div>
                  </div>
                )}
                {/* GPS info */}
                <div className="flex items-center gap-sm p-sm bg-surface-container-low rounded-lg">
                  <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {gpsPos ? `${gpsPos.lat.toFixed(6)}, ${gpsPos.lng.toFixed(6)} (±${Math.round(gpsPos.accuracy)}m)` : 'Menunggu GPS...'}
                  </span>
                </div>
              </div>

              {/* Dev test mode */}
              {isDevEnv && (
                <button
                  onClick={() => setTestMode(m => !m)}
                  className={`flex items-center justify-between p-sm rounded-lg border transition-colors ${
                    testMode
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-600'
                      : 'bg-surface-container border-outline-variant text-on-surface-variant'
                  }`}
                >
                  <span className="flex items-center gap-sm font-label-sm text-[11px]">
                    <span className="material-symbols-outlined text-[16px]">science</span>
                    Mode Testing (bypass geofencing)
                  </span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors ${testMode ? 'bg-amber-500' : 'bg-outline-variant'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${testMode ? 'left-4' : 'left-0.5'}`} />
                  </span>
                </button>
              )}
            </div>
            <div className="p-md bg-surface-container-lowest border-t border-surface-variant flex gap-md shrink-0">
              <button onClick={() => { setShowStopModal(false); stopEndCamera(); setEndSelfieDataUrl(null); setEndVerified(false); }} className="flex-1 py-3 rounded-xl border border-outline text-on-surface font-label-sm hover:bg-surface-container-low">
                Batal
              </button>
              <button
                onClick={() => { confirmEndVerification(); if (endSelfieDataUrl) handleStopTracking(); }}
                disabled={!endSelfieDataUrl || !withinEndGeofence || isStopping}
                className="flex-[2] py-3 rounded-xl bg-error text-on-error font-label-sm flex items-center justify-center gap-sm shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>stop_circle</span>
                {isStopping ? 'Menghentikan...' : 'Konfirmasi Selesai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
