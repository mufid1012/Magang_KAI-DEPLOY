'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [nipp, setNipp] = useState('');
  const [nama, setNama] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Password dan Konfirmasi Password tidak cocok');
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.post('/auth/register', { nipp, nama, password });
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        const role = res.data.user?.role;
        router.push(role === 'admin' ? '/admin' : '/inspeksi');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Gagal registrasi. Silakan coba lagi.');
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
          <img src="/logo-kai.png" alt="KAI Logo" className="h-10 w-auto object-contain" />
          <h1 className="font-h2 text-h2 font-bold tracking-tight">Petugas Pemeriksa Jalur</h1>
        </div>

        <div className="relative z-10 text-on-primary max-w-lg">
          <h2 className="font-h1 text-h1 mb-md leading-tight">Gabunglah bersama kami Menjadi<br />Petugas Pemeriksa Jalur.</h2>
          <p className="font-body-lg text-body-lg text-primary-fixed-dim">
            Daftarkan akun Anda untuk mengakses data real-time, analitik prediktif, dan pelaporan lapangan yang mudah.
          </p>
        </div>
      </div>

      {/* Right Column: Forms Container */}
      <div className="w-full lg:w-[55%] flex items-center justify-center bg-surface-container-lowest p-md sm:p-xl">
        <div className="w-full max-w-[420px]">
          {/* Mobile Logo (Visible only on small screens) */}
          <div className="flex lg:hidden items-center gap-3 mb-xl">
            <img src="/logo-kai.png" alt="KAI Logo" className="h-10 w-auto object-contain" />
            <h1 className="font-h2 text-h2 font-bold text-primary tracking-tight">Petugas Pemeriksa Jalur</h1>
          </div>

          {/* Page Header */}
          <div className="mb-lg">
            <h2 className="font-h1 text-h1 text-on-surface mb-2">Buat Akun</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Isi data di bawah ini untuk mendaftar.</p>
          </div>

          {/* Register Form */}
          <form className="flex flex-col gap-md" onSubmit={handleRegister}>
            {error && (
              <div className="bg-error-container text-on-error-container p-3 rounded-lg font-body-md text-sm">
                {error}
              </div>
            )}

            {/* NIPP Input */}
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-on-surface" htmlFor="nipp">NIPP (ID Karyawan)</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">badge</span>
                <input
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-body-lg text-on-surface placeholder:text-outline shadow-sm"
                  id="nipp"
                  placeholder="Masukkan NIPP Anda"
                  type="text"
                  value={nipp}
                  onChange={(e) => setNipp(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Nama Input */}
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-on-surface" htmlFor="nama">Nama Lengkap</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">person</span>
                <input
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-body-lg text-on-surface placeholder:text-outline shadow-sm"
                  id="nama"
                  placeholder="Masukkan nama lengkap Anda"
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-on-surface" htmlFor="password">Kata Sandi</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">lock</span>
                <input
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-body-lg text-on-surface shadow-sm"
                  id="password"
                  placeholder="Buat kata sandi"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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

            {/* Confirm Password Input */}
            <div className="flex flex-col gap-2">
              <label className="font-label-sm text-label-sm text-on-surface" htmlFor="confirmPassword">Konfirmasi Kata Sandi</label>
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">lock_clock</span>
                <input
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-body-lg text-body-lg text-on-surface shadow-sm"
                  id="confirmPassword"
                  placeholder="Konfirmasi kata sandi Anda"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-col gap-4">
              <button
                className="w-full h-12 bg-primary text-on-primary rounded-xl font-label-sm text-label-sm shadow-[0px_8px_24px_rgba(0,91,172,0.15)] hover:bg-surface-tint active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-70 disabled:cursor-not-allowed"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? 'Membuat Akun...' : 'Daftar'} <span className="material-symbols-outlined text-[18px]">person_add</span>
              </button>
              <p className="font-body-md text-body-md text-on-surface-variant text-center">
                Sudah punya akun? <Link className="text-primary font-semibold hover:underline" href="/login">Masuk di sini</Link>
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
