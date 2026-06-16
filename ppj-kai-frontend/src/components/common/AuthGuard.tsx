'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const PUBLIC_ROUTES = ['/login', '/register', '/guest'];
const ADMIN_ROUTES = ['/admin'];
const QC_ROUTES = ['/qc'];
const PPJ_ROUTES = ['/inspeksi'];

const ADMIN_KUPT_ROLES = ['admin', 'kupt'];

/** Return the home route for a given role */
function homeForRole(role: string): string {
  if (role === 'qc') return '/qc';
  if (ADMIN_KUPT_ROLES.includes(role)) return '/admin';
  return '/inspeksi';
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const role = userStr ? (JSON.parse(userStr)?.role ?? 'ppj') : null;

    const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
    const isAdminRoute = ADMIN_ROUTES.some(r => pathname.startsWith(r));
    const isQcRoute = QC_ROUTES.some(r => pathname.startsWith(r));
    const isPpjRoute = PPJ_ROUTES.some(r => pathname.startsWith(r));
    const isGuestRoute = pathname === '/guest' || pathname.startsWith('/guest/');

    // Guest route is public — always allow without token
    if (isGuestRoute) {
      setReady(true);
      return;
    }

    if (!token) {
      // Not logged in — redirect to login unless on a public route
      if (!isPublic) {
        router.replace('/login');
        return;
      }
    } else if (pathname === '/login' || pathname === '/register') {
      // Already logged in — redirect away from login/register to role-specific home
      router.replace(homeForRole(role));
      return;
    } else if (isAdminRoute && !ADMIN_KUPT_ROLES.includes(role)) {
      // Non-admin/kupt trying to access /admin → redirect to their home
      router.replace(homeForRole(role));
      return;
    } else if (isQcRoute && role !== 'qc') {
      // Non-QC trying to access /qc → redirect to their home
      router.replace(homeForRole(role));
      return;
    } else if (isPpjRoute && role !== 'ppj') {
      // Non-PPJ trying to access /inspeksi → redirect to their home
      router.replace(homeForRole(role));
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready && !PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) {
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
