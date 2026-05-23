'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const PUBLIC_ROUTES = ['/login', '/register'];
const ADMIN_ROUTES = ['/admin'];
const PETUGAS_ROUTES = ['/inspeksi'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const role = userStr ? (JSON.parse(userStr)?.role ?? 'petugas') : null;

    const isPublic = PUBLIC_ROUTES.includes(pathname);
    const isAdminRoute = ADMIN_ROUTES.some(r => pathname.startsWith(r));
    const isPetugasRoute = PETUGAS_ROUTES.some(r => pathname.startsWith(r));

    if (!token) {
      // Not logged in — redirect to login unless already there
      if (!isPublic) {
        router.replace('/login');
        return;
      }
    } else if (isPublic) {
      // Already logged in — redirect away from login
      router.replace(role === 'admin' ? '/admin' : '/inspeksi');
      return;
    } else if (isAdminRoute && role !== 'admin') {
      // Petugas trying to access admin
      router.replace('/inspeksi');
      return;
    } else if (isPetugasRoute && role === 'admin') {
      // Admin trying to access petugas routes
      router.replace('/admin');
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready && !PUBLIC_ROUTES.includes(pathname)) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-md text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[40px] animate-spin">refresh</span>
          <p className="font-body-md">Memverifikasi sesi...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
