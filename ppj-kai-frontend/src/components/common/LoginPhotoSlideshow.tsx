'use client';

import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { LoginPhoto, loginPhotoUrl } from '../../lib/loginPhotos';

export default function LoginPhotoSlideshow() {
  const [photos, setPhotos] = useState<LoginPhoto[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/login-photos', { signal: controller.signal })
      .then(res => setPhotos(res.data.data))
      .catch(() => { /* Keep the default picture when the API is unavailable. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (photos.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => setCurrent(index => (index + 1) % photos.length), 6000);
    return () => window.clearInterval(interval);
  }, [photos]);

  const photo = photos[current];
  return (
    <>
      <img key={photo?.url || 'default'} src={photo ? loginPhotoUrl(photo) : '/cc206.png'} alt={photo?.title || 'Kereta KAI'} className="absolute inset-0 w-full h-full object-cover opacity-80" onError={event => {
        const image = event.currentTarget;
        if (image.getAttribute('src') !== '/cc206.png') image.src = '/cc206.png';
      }} />
      {photos.length > 1 && (
        <div className="absolute top-24 right-6 z-20 flex gap-2 rounded-full bg-black/25 p-2" role="group" aria-label="Pilih foto login">
          {photos.map((item, index) => (
            <button key={item.id} type="button" aria-label={`Tampilkan foto ${item.title}`} aria-pressed={index === current} onClick={() => setCurrent(index)} className={`h-3 rounded-full transition-all ${index === current ? 'w-7 bg-white' : 'w-3 bg-white/50 hover:bg-white'}`} />
          ))}
        </div>
      )}
    </>
  );
}
