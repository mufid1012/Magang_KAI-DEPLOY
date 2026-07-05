'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Backward compatibility: redirect old /inspeksi/:id URLs to the new tab-based page
export default function TrackingPageRedirect({ params }: { params: { id: string } }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/inspeksi?tab=tracking&id=${params.id}`);
  }, [router, params.id]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-md text-on-surface-variant">
        <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
        <p className="font-body-md">Mengalihkan...</p>
      </div>
    </div>
  );
}
