'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { CameraSession } from '../lib/cameraSession';
import { showToast } from '../lib/toast';

export function useCamera(facingMode: 'user' | 'environment', onCapture: (image: string) => void) {
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef(new CameraSession());
  const stop = useCallback(() => { session.current.stop(); setActive(false); }, []);
  const open = async () => {
    try {
      const stream = await session.current.open(() => navigator.mediaDevices.getUserMedia({ video: { facingMode } }));
      if (stream) setActive(true);
    } catch { showToast('Tidak dapat mengakses kamera.', 'error'); }
  };
  useEffect(() => {
    if (!active || !videoRef.current || !session.current.stream) return;
    const video = videoRef.current;
    video.srcObject = session.current.stream;
    void video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [active]);
  useEffect(() => { const current = session.current; return () => current.stop(); }, []);
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.7));
    stop();
  };
  return { active, videoRef, open, stop, capture };
}
