'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import { getApiErrorMessage } from '../../lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const [nipp, setNipp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', { nipp, password });
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        const role = res.data.user?.role;
        const dest = role === 'qc' ? '/qc'
          : ['admin', 'kupt'].includes(role) ? '/admin'
          : role === 'guest' ? '/guest'
          : '/inspeksi';
        router.push(dest);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Gagal login. Periksa NIPP dan Password.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex w-full min-h-screen bg-surface">
      {/* Left Column: Branding & Illustration (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-primary-fixed overflow-hidden flex-col justify-between p-xl">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-80"
          style={{ backgroundImage: "url('/cc206.png')" }}

        />
        {/* Dark Gradient Overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-primary/20 mix-blend-multiply"></div>

        {/* Brand Content */}
        <div className="relative z-10 flex items-center gap-3 text-on-primary">
          <img src="/logo-kai.png" alt="Logo KAI" className="h-10 w-auto object-contain drop-shadow-md" />
          <h1 className="font-h2 text-h2 font-bold tracking-tight">Petugas Pemeriksa Jalur</h1>
        </div>

        <div className="relative z-10 text-on-primary max-w-lg">
          <h2 className="font-h2 text-h2 mb-md leading-tight">Monitoring Petugas Pemeriksa Jalur<br/>DAOP 6 Yogyakarta.</h2>

          
          {/* Trust Indicators */}
          <div className="flex gap-lg mt-xl pt-lg border-t border-primary-fixed-dim/30">
            <div>
              <div className="font-h2 text-h2 font-bold text-on-primary">99.9%</div>
              <div className="font-label-sm text-label-sm text-primary-fixed-dim uppercase tracking-wider mt-1">Uptime</div>
            </div>
            <div>
              <div className="font-h2 text-h2 font-bold text-on-primary">24/7</div>
              <div className="font-label-sm text-label-sm text-primary-fixed-dim uppercase tracking-wider mt-1">Monitoring</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Forms Container */}
      <div className="w-full lg:w-[55%] flex items-center justify-center bg-surface-container-lowest p-md sm:p-xl">
        <div className="w-full max-w-[420px]">
          {/* Mobile Logo (Visible only on small screens) */}
          <div className="flex lg:hidden items-center gap-3 mb-xl">
            <img src="/logo-kai.png" alt="Logo KAI" className="h-10 w-auto object-contain" />
            <h1 className="font-h2 text-h2 font-bold text-primary tracking-tight">Petugas Pemeriksa Jalur</h1>
          </div>

          {/* Page Header */}
          <div className="mb-lg">
            <h2 className="font-h1 text-h1 text-on-surface mb-2">Akses Portal</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Silakan masuk menggunakan akun yang telah terdaftar.</p>
          </div>

          {/* Login Form */}
          <form className="flex flex-col gap-lg" onSubmit={handleLogin}>
            {error && (
              <div className="bg-error-container text-on-error-container p-3 rounded-lg font-body-md text-sm">
                {error}
              </div>
            )}

            {/* NIPP Input */}
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-on-surface" htmlFor="nipp">NIPP (Employee ID)</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">badge</span>
                <input 
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-body-lg text-on-surface placeholder:text-outline shadow-sm" 
                  id="nipp" 
                  placeholder="Masukkan NIPP Anda" 
                  type="text" 
                  value={nipp}
                  onChange={(e) => setNipp(e.target.value)}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="font-label-sm text-label-sm text-on-surface" htmlFor="password">Password</label>
                <Link className="font-label-sm text-label-sm text-primary hover:text-primary-container transition-colors" href="#">Lupa Password?</Link>
              </div>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">lock</span>
                <input 
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-body-lg text-on-surface shadow-sm" 
                  id="password" 
                  placeholder="Masukkan password" 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors focus:outline-none"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined">{showPassword ? 'visibility' : 'visibility_off'}</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-2 flex flex-col gap-4">
              <button
                className="w-full h-12 bg-primary text-on-primary rounded-xl font-label-sm text-label-sm shadow-[0px_8px_24px_rgba(0,91,172,0.15)] hover:bg-surface-tint active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-70 disabled:cursor-not-allowed"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Memverifikasi...' : 'Masuk'} <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>

              <div className="flex items-center my-1">
                <div className="flex-1 h-px bg-outline-variant/60"></div>
                <span className="px-3 font-label-sm text-[10px] text-outline uppercase tracking-wider">Atau</span>
                <div className="flex-1 h-px bg-outline-variant/60"></div>
              </div>

              <Link
                href="/guest"
                className="w-full h-12 border border-primary text-primary rounded-xl font-label-sm text-label-sm hover:bg-primary/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-wider font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span> Masuk Sebagai Guest
              </Link>

              <p className="font-body-md text-body-md text-on-surface-variant text-center">
                Belum memiliki akun? Hubungi Super Admin untuk pembuatan akun.
              </p>
            </div>
          </form>

          {/* Footer Info */}
          <div className="mt-xl pt-xl border-t border-surface-container-highest text-center">
            <p className="font-label-sm text-label-sm text-outline">
              Dilindungi oleh Protokol Keamanan Internal KAI © 2026

            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
