'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import api from '../../lib/api';
import { useRouter } from 'next/navigation';

// Same deterministic color as AdminMap — NIPP → unique HSL color
function petugasColor(nipp: string): string {
  let hash = 0;
  for (let i = 0; i < nipp.length; i++) {
    hash = nipp.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return `hsl(${(Math.abs(hash) * 137) % 360}, 65%, 42%)`;
}

const AdminMap = dynamic(() => import('../../components/map/AdminMap'), { ssr: false });

// ─── Station Data (DAOP 6 Yogyakarta region) ────────────────────────────────
const STATIONS = [
  { name: 'Sta. Maguwo', lat: -7.785040, lng: 110.436899 },
  { name: 'Sta. Lempuyangan', lat: -7.789961, lng: 110.375275 },
  { name: 'Sta. Yogyakarta', lat: -7.788870, lng: 110.363213 },
  { name: 'Sta. Patukan', lat: -7.790771, lng: 110.325332 },
  { name: 'Sta. Wojo', lat: -7.862278, lng: 110.041092 },
  { name: 'Sta. Jenar', lat: -7.802037, lng: 110.000797 },
  { name: 'Sta. Wates', lat: -7.859248, lng: 110.158247 },
  { name: 'Sta. Brambanan', lat: -7.756641, lng: 110.500415 },
  { name: 'Sta. Klaten', lat: -7.712576, lng: 110.602980 },
  { name: 'Sta. Delanggu', lat: -7.622398, lng: 110.706588 },
  { name: 'Sta. Solo Balapan', lat: -7.557184, lng: 110.819394 },
  { name: 'Sta. Wonogiri', lat: -7.815882, lng: 110.921733 },
  { name: 'Sta. Sumberlawang', lat: -7.327810, lng: 110.863565 },
  { name: 'Sta. Palur', lat: -7.568030, lng: 110.875387 },
  { name: 'Sta. Sragen', lat: -7.429623, lng: 111.016701 },
] as const;

interface Petugas { id: number; nipp: string; nama: string; tugasPpj: { id: number; jalur: string; status: string }[] }
interface Tugas { id: number; jalur: string; tanggal: string; startPointLat: number; startPointLong: number; endPointLat: number; endPointLong: number; startPointName: string; endPointName: string; status: string; user: { nama: string; nipp: string }, tracking?: { startTime: string, endTime: string, durasi: number, status: string, laporan: Emergency[] }[] }
interface Emergency { id: number; latitude: number; longitude: number; jenisTemuan: string; deskripsi: string; foto: string | null; createdAt: string; tracking?: { tugas: { jalur: string; user: { nama: string; nipp: string } } } }
interface Stats { totalPetugas: number; tugasAktif: number; tugasSelesai: number; laporanDarurat: number }
interface ManagedUser { id: number; nipp: string; nama: string; role: string; isActive: boolean; jabatan?: string; division?: string; workArea?: string; phone?: string; managerId?: number; createdAt: string; wilayahAssignments: { id: number; wilayah: { id: number; kode: string; nama: string; stations: string } }[] }
interface WilayahItem { id: number; kode: string; nama: string; stations: string }

const ROLE_BADGE: Record<string, { label: string; bg: string }> = {
  admin: { label: 'Super Admin', bg: 'bg-slate-800' },
  qc: { label: 'Quality Control', bg: 'bg-indigo-600' },
  kupt: { label: 'KUPT', bg: 'bg-teal-600' },
};
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', qc: 'QC', kupt: 'KUPT', ppj: 'PPJ' };

const STATUS_COLOR: Record<string, string> = { pending: 'bg-surface-container text-on-surface-variant border-outline-variant', in_progress: 'bg-primary-container/20 text-primary border-primary/30', completed: 'bg-primary-fixed text-on-primary-fixed-variant border-transparent' };
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', in_progress: 'Berlangsung', completed: 'Selesai' };
const JENIS_LABEL: Record<string, string> = { berat: 'Baut Lepas', emergency: 'Rel Retak', sedang: 'Penghalang', ringan: 'Lainnya' };
const JENIS_COLOR: Record<string, string> = {
  berat: 'bg-rose-100 text-rose-700',
  emergency: 'bg-rose-100 text-rose-700',
  sedang: 'bg-blue-100 text-blue-700',
  ringan: 'bg-slate-100 text-slate-700',
};

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ nama: string; role: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [petugas, setPetugas] = useState<Petugas[]>([]);
  const [tugas, setTugas] = useState<Tugas[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'tasks' | 'emergency'>('map');

  // Sidebar menu state
  const [activeMenu, setActiveMenu] = useState<'penugasan' | 'liveview' | 'akun'>('penugasan');

  // Role-derived permissions
  const userRole = user?.role || 'admin';
  const canWrite = userRole === 'admin' || userRole === 'kupt';
  const isAdmin = userRole === 'admin';

  // User wilayah stations (for KUPT station filtering)
  const [userStations, setUserStations] = useState<string[]>([]);
  const filteredStations = canWrite && !isAdmin && userStations.length > 0
    ? STATIONS.filter(s => userStations.includes(s.name))
    : STATIONS;

  // Account management state (admin only)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [allWilayah, setAllWilayah] = useState<WilayahItem[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [userForm, setUserForm] = useState({ nipp: '', nama: '', password: '', role: 'ppj' as string, wilayahIds: [] as number[] });
  const [savingUser, setSavingUser] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Task form state
  const [form, setForm] = useState({ jalur: '', tanggal: '', assignedTo: '', startPointName: '', endPointName: '', startPointLat: '', startPointLong: '', endPointLat: '', endPointLong: '', jamMulai: '', jamSelesai: '' });
  const [submitting, setSubmitting] = useState(false);

  const [showAddPetugasModal, setShowAddPetugasModal] = useState(false);
  const [availablePetugas, setAvailablePetugas] = useState<{id: number, nipp: string, nama: string}[]>([]);
  const [searchPetugas, setSearchPetugas] = useState('');
  const [selectedNipps, setSelectedNipps] = useState<string[]>([]);
  const [addingPetugas, setAddingPetugas] = useState(false);
  
  // History state
  const [selectedPetugasHistory, setSelectedPetugasHistory] = useState<Petugas | null>(null);

  // ── Import Excel state ──
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number; errorDetails: { row: number; message: string }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Template state ──
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateView, setTemplateView] = useState<'list' | 'create' | 'apply'>('list');
  const [templateForm, setTemplateForm] = useState({ nama: '', items: [{ assignedTo: '', startPointName: '', endPointName: '', jamMulai: '', jamSelesai: '' }] });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [applyDates, setApplyDates] = useState({ startDate: '', endDate: '' });

  const fetchAvailablePetugas = async () => {
    try {
      const res = await api.get('/admin/petugas/available');
      setAvailablePetugas(res.data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, petugasRes, tugasRes, emRes] = await Promise.all([
        api.get('/admin/stats'), api.get('/admin/petugas'), api.get('/admin/tugas'), api.get('/admin/emergency'),
      ]);
      setStats(statsRes.data.data);
      setPetugas(petugasRes.data.data);
      setTugas(tugasRes.data.data);
      setEmergencies(emRes.data.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, wilayahRes] = await Promise.all([
        api.get('/admin/users'), api.get('/admin/wilayah'),
      ]);
      setManagedUsers(usersRes.data.data);
      setAllWilayah(wilayahRes.data.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      setUser(parsed);
    }
    // Fetch user profile for wilayah info
    api.get('/auth/me').then(res => {
      const me = res.data.user;
      if (me?.wilayahAssignments) {
        const stationNames: string[] = [];
        for (const wa of me.wilayahAssignments) {
          try { stationNames.push(...JSON.parse(wa.wilayah.stations)); } catch {}
        }
        setUserStations(stationNames);
      }
    }).catch(() => {});
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

  // Account management handlers (admin only)
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserForm({ nipp: '', nama: '', password: '', role: 'ppj', wilayahIds: [] });
    setShowUserModal(true);
  };
  const handleOpenEditUser = (u: ManagedUser) => {
    setEditingUser(u);
    setUserForm({
      nipp: u.nipp, nama: u.nama, password: '', role: u.role,
      wilayahIds: u.wilayahAssignments.map(wa => wa.wilayah.id),
    });
    setShowUserModal(true);
  };
  const handleSaveUser = async () => {
    if (!userForm.nipp || !userForm.nama || !userForm.role) { alert('Lengkapi semua field!'); return; }
    if (!editingUser && !userForm.password) { alert('Password wajib diisi untuk akun baru!'); return; }
    try {
      setSavingUser(true);
      if (editingUser) {
        await api.patch(`/admin/users/${editingUser.id}`, {
          nama: userForm.nama, role: userForm.role, wilayahIds: userForm.wilayahIds,
          ...(userForm.password ? { password: userForm.password } : {}),
        });
      } else {
        await api.post('/admin/users', userForm);
      }
      setShowUserModal(false);
      fetchUsers();
    } catch (e: any) { alert(e.response?.data?.message || 'Gagal menyimpan akun.'); }
    finally { setSavingUser(false); }
  };
  const handleToggleUserActive = async (u: ManagedUser) => {
    const action = u.isActive ? 'Nonaktifkan' : 'Aktifkan';
    if (!confirm(`${action} akun ${u.nama}?`)) return;
    try {
      if (u.isActive) {
        await api.delete(`/admin/users/${u.id}`);
      } else {
        await api.patch(`/admin/users/${u.id}`, { isActive: true });
      }
      fetchUsers();
    } catch (e: any) { alert(e.response?.data?.message || 'Gagal.'); }
  };

  // Station dropdown handlers
  const handleStartStationChange = (stationName: string) => {
    const station = STATIONS.find(s => s.name === stationName);
    if (station) {
      setForm(f => {
        const newForm = {
          ...f,
          startPointName: station.name,
          startPointLat: station.lat.toFixed(6),
          startPointLong: station.lng.toFixed(6),
        };
        // Auto-fill jalur if both stations are selected
        if (newForm.endPointName) {
          newForm.jalur = `${station.name} → ${newForm.endPointName}`;
        }
        return newForm;
      });
    } else {
      setForm(f => ({ ...f, startPointName: '', startPointLat: '', startPointLong: '' }));
    }
  };

  const handleEndStationChange = (stationName: string) => {
    const station = STATIONS.find(s => s.name === stationName);
    if (station) {
      setForm(f => {
        const newForm = {
          ...f,
          endPointName: station.name,
          endPointLat: station.lat.toFixed(6),
          endPointLong: station.lng.toFixed(6),
        };
        // Auto-fill jalur if both stations are selected
        if (newForm.startPointName) {
          newForm.jalur = `${newForm.startPointName} → ${station.name}`;
        }
        return newForm;
      });
    } else {
      setForm(f => ({ ...f, endPointName: '', endPointLat: '', endPointLong: '' }));
    }
  };

  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
  };

  const handleCreateTugas = async () => {
    if (!form.jalur || !form.tanggal || !form.assignedTo || !form.startPointLat || !form.endPointLat) { alert('Lengkapi semua field!'); return; }
    try {
      setSubmitting(true);
      await api.post('/admin/tugas', form);
      setShowTaskModal(false);
      setForm({ jalur: '', tanggal: '', assignedTo: '', startPointName: '', endPointName: '', startPointLat: '', startPointLong: '', endPointLat: '', endPointLong: '', jamMulai: '', jamSelesai: '' });
      fetchAll();
    } catch (e: any) { console.error(e); alert(e.response?.data?.message || 'Gagal membuat tugas.'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteTugas = async (id: number) => {
    if (!confirm('Hapus tugas ini?')) return;
    try { await api.delete(`/admin/tugas/${id}`); fetchAll(); } catch { alert('Gagal menghapus.'); }
  };

  const handleAddPetugas = async () => {
    if (selectedNipps.length === 0) return;
    try {
      setAddingPetugas(true);
      const res = await api.post('/admin/petugas/add', { nipps: selectedNipps });
      alert(res.data.message);
      setShowAddPetugasModal(false);
      setSelectedNipps([]);
      fetchAll();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Gagal menambahkan petugas.');
    } finally {
      setAddingPetugas(false);
    }
  };

  const handleRemovePetugas = async (id: number) => {
    if (!confirm('Hapus petugas ini dari daftar kelola Anda? Mereka tidak akan dihapus dari sistem, hanya dari pantauan Anda.')) return;
    try {
      await api.post('/admin/petugas/remove', { id });
      fetchAll();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Gagal menghapus petugas.');
    }
  };

  // ── Import Excel handlers ──
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/admin/tugas/template-excel', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'template_jadwal_ppj.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert('Gagal mengunduh template.'); }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.xlsx')) { alert('Hanya file .xlsx yang diizinkan'); return; }
    setImportFile(file);
    setImportResult(null);
    // Read preview using FileReader
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        setImportPreview((data as any[][]).slice(0, 11)); // header + max 10 rows
      } catch { setImportPreview(null); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportExcel = async () => {
    if (!importFile) return;
    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await api.post('/admin/tugas/import-excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.data);
      if (res.data.data.imported > 0) fetchAll();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Gagal import file.');
    } finally { setImporting(false); }
  };

  const handleCloseImport = () => {
    setShowImportModal(false); setImportFile(null); setImportPreview(null); setImportResult(null); setDragOver(false);
  };

  // ── Template handlers ──
  const fetchTemplates = async () => {
    try {
      const res = await api.get('/admin/templates');
      setTemplates(res.data.data);
    } catch { console.error('Failed to fetch templates'); }
  };

  const handleCreateTemplate = async () => {
    if (!templateForm.nama.trim()) { alert('Nama template wajib diisi'); return; }
    const validItems = templateForm.items.filter(i => i.assignedTo && i.startPointName && i.endPointName);
    if (validItems.length === 0) { alert('Minimal 1 item rute yang lengkap'); return; }
    try {
      setSavingTemplate(true);
      await api.post('/admin/templates', { nama: templateForm.nama, items: validItems });
      setTemplateView('list');
      setTemplateForm({ nama: '', items: [{ assignedTo: '', startPointName: '', endPointName: '', jamMulai: '', jamSelesai: '' }] });
      fetchTemplates();
    } catch (e: any) { alert(e.response?.data?.message || 'Gagal menyimpan template.'); }
    finally { setSavingTemplate(false); }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Hapus template ini?')) return;
    try { await api.delete(`/admin/templates/${id}`); fetchTemplates(); }
    catch { alert('Gagal menghapus template.'); }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate || !applyDates.startDate || !applyDates.endDate) { alert('Pilih template dan rentang tanggal'); return; }
    try {
      setApplyingTemplate(true);
      const res = await api.post(`/admin/templates/${selectedTemplate.id}/apply`, applyDates);
      alert(res.data.message);
      setTemplateView('list'); setSelectedTemplate(null); setApplyDates({ startDate: '', endDate: '' });
      fetchAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Gagal menerapkan template.'); }
    finally { setApplyingTemplate(false); }
  };

  const handleAddTemplateItem = () => {
    setTemplateForm(f => ({ ...f, items: [...f.items, { assignedTo: '', startPointName: '', endPointName: '', jamMulai: '', jamSelesai: '' }] }));
  };

  const handleRemoveTemplateItem = (idx: number) => {
    setTemplateForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const handleTemplateItemChange = (idx: number, field: string, value: string) => {
    setTemplateForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item) }));
  };

  const mapEmergencies = emergencies.map(e => ({ id: e.id, latitude: e.latitude, longitude: e.longitude, jenisTemuan: e.jenisTemuan, deskripsi: e.deskripsi, foto: e.foto, createdAt: e.createdAt, petugasNama: e.tracking?.tugas?.user?.nama, jalur: e.tracking?.tugas?.jalur }));
  const mapTasks = tugas.map(t => ({ id: t.id, jalur: t.jalur, startPointLat: t.startPointLat, startPointLong: t.startPointLong, endPointLat: t.endPointLat, endPointLong: t.endPointLong, startPointName: t.startPointName, endPointName: t.endPointName, status: t.status, petugasNama: t.user?.nama, petugasNipp: t.user?.nipp }));

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Premium Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <img src="/logo-kai.png" alt="KAI Logo" className="h-8 w-auto object-contain" />
          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="font-h3 text-lg font-extrabold text-slate-800 tracking-tight hidden sm:block">Command Center <span className="text-primary">PPJ</span></h1>
          <span className={`ml-2 px-2 py-0.5 text-white font-label-sm text-[10px] rounded uppercase font-bold tracking-widest shadow-sm ${ROLE_BADGE[userRole]?.bg || 'bg-slate-800'}`}>{ROLE_BADGE[userRole]?.label || 'Portal Admin'}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-container text-primary rounded-full flex items-center justify-center font-bold text-sm border border-primary/20">
              {user?.nama?.substring(0, 2).toUpperCase() || 'AD'}
            </div>
            <div className="hidden md:flex flex-col">
              <span className="font-body-md text-sm font-bold text-slate-700 leading-none">{user?.nama}</span>
            </div>
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-error transition-colors font-label-sm font-semibold">
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Vertical Sidebar Nav */}
        <nav className="w-[72px] bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-2 shrink-0">
          <button
            onClick={() => setActiveMenu('penugasan')}
            className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
              activeMenu === 'penugasan'
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Penugasan PPJ"
          >
            <span className="material-symbols-outlined text-[22px]">assignment</span>
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Tugas</span>
          </button>
          <button
            onClick={() => setActiveMenu('liveview')}
            className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
              activeMenu === 'liveview'
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Live View"
          >
            <span className="material-symbols-outlined text-[22px]">map</span>
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Live</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => { setActiveMenu('akun'); fetchUsers(); }}
              className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                activeMenu === 'akun'
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title="Kelola Akun"
            >
              <span className="material-symbols-outlined text-[22px]">manage_accounts</span>
              <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Akun</span>
            </button>
          )}
        </nav>

        {/* ── PENUGASAN VIEW ──────────────────────────────────── */}
        {activeMenu === 'penugasan' && (
          <div className="flex flex-1 overflow-hidden p-4 gap-4">
            {/* Left Sidebar (Stats + Lists) */}
            <aside className="w-[420px] flex flex-col gap-4 shrink-0">
              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-3 shrink-0">
                {[
                  { label: 'Total Petugas', value: stats?.totalPetugas ?? '-', icon: 'group', color: 'text-blue-600', bg: 'bg-white', border: 'border-slate-200' },
                  { label: 'Tugas Aktif', value: stats?.tugasAktif ?? '-', icon: 'task_alt', color: 'text-amber-600', bg: 'bg-white', border: 'border-slate-200' },
                  { label: 'Tugas Selesai', value: stats?.tugasSelesai ?? '-', icon: 'check_circle', color: 'text-emerald-600', bg: 'bg-white', border: 'border-slate-200' },
                  { label: 'Laporan Darurat', value: stats?.laporanDarurat ?? '-', icon: 'emergency', color: 'text-rose-600', bg: 'bg-white', border: 'border-slate-200' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 border shadow-sm flex items-center gap-3 ${s.bg} ${s.border}`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-slate-50 ${s.color}`}>
                      <span className="material-symbols-outlined text-[20px]">{s.icon}</span>
                    </div>
                    <div>
                      <p className="font-h2 text-xl font-extrabold text-slate-800 leading-none mb-1">{s.value}</p>
                      <p className="font-label-sm text-[10px] text-slate-500 uppercase tracking-wider font-semibold leading-none">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Activity Panel */}
              <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
                  <button onClick={() => setActiveTab('map')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'map' ? 'text-primary border-primary bg-primary-container/5' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}>
                    Petugas
                  </button>
                  <button onClick={() => setActiveTab('tasks')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'tasks' ? 'text-primary border-primary bg-primary-container/5' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}>
                    Penugasan
                  </button>
                  <button onClick={() => setActiveTab('emergency')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'emergency' ? 'text-rose-600 border-rose-600 bg-rose-50/50' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}>
                    Insiden
                  </button>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-white relative">
                  
                  {/* Petugas Tab */}
                  {activeTab === 'map' && (
                    <div className="space-y-3">
                      {petugas.length === 0 && (
                        <div className="text-center py-8">
                          <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">person_off</span>
                          <p className="text-slate-500 text-sm font-medium px-4">Belum ada petugas di bawah kelolaan Anda.</p>
                          <p className="text-slate-400 text-xs mt-1">Silakan klik Tambah Petugas di bawah.</p>
                        </div>
                      )}
                      {petugas.map(p => {
                        const aktif = p.tugasPpj.find(t => t.status === 'in_progress');
                        return (
                          <div 
                            key={p.id} 
                            onClick={() => setSelectedPetugasHistory(p)}
                            className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-center gap-3 relative group cursor-pointer hover:border-primary/50 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-inner shrink-0" style={{ background: petugasColor(p.nipp) }}>
                              {p.nama.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 truncate text-sm group-hover:text-primary transition-colors">{p.nama}</p>
                              <p className="text-xs text-slate-500 mt-0.5 font-medium">{p.nipp}</p>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border shrink-0 ${aktif ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${aktif ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`}></div>
                              <span className="text-[10px] font-bold uppercase tracking-widest">{aktif ? 'Patroli' : 'Standby'}</span>
                            </div>
                            {/* Remove button (shows on hover) — only for admin/kupt */}
                            {canWrite && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleRemovePetugas(p.id); }} 
                                className="absolute -top-2 -right-2 w-7 h-7 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-rose-600 hover:border-rose-300 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tasks Tab */}
                  {activeTab === 'tasks' && (
                    <div className="space-y-3">
                      {tugas.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Belum ada tugas dibuat.</p>}
                      {tugas.map(t => (
                        <div key={t.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <p className="font-bold text-slate-800 text-sm leading-snug">{t.jalur}</p>
                            {canWrite && (
                              <button onClick={() => handleDeleteTugas(t.id)} className="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded hover:bg-rose-100 shrink-0">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-primary font-semibold mb-3">{t.user?.nama}</p>
                          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                            <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
                              {haversineKm(t.startPointLat, t.startPointLong, t.endPointLat, t.endPointLong)} km
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Emergency Tab */}
                  {activeTab === 'emergency' && (
                    <div className="space-y-4">
                      {emergencies.length === 0 && (
                        <div className="text-center py-8">
                          <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">check_circle</span>
                          <p className="text-slate-500 text-sm font-medium">Semua jalur terpantau aman.</p>
                        </div>
                      )}
                      {emergencies.map(e => (
                        <button key={e.id} onClick={() => setSelectedEmergency(e)} className="w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm hover:border-rose-300 transition-all group overflow-hidden flex flex-col">
                          {e.foto && <div className="w-full h-24 overflow-hidden"><img src={e.foto} alt="darurat" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>}
                          <div className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-widest">{JENIS_LABEL[e.jenisTemuan] ?? e.jenisTemuan}</span>
                              <span className="text-slate-500 text-[10px] font-semibold">{new Date(e.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="font-bold text-slate-800 text-xs mb-1">{e.tracking?.tugas?.user?.nama}</p>
                            <p className="text-slate-500 text-[10px] font-mono bg-slate-50 border border-slate-100 inline-block px-1.5 py-0.5 rounded">{e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Action Buttons (Docked) — only for admin/kupt */}
                {canWrite && activeTab === 'tasks' && (
                  <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0 space-y-2">
                    <button onClick={() => setShowTaskModal(true)} className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]">
                      <span className="material-symbols-outlined text-[18px]">add</span> Tugaskan Pemeriksa
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setShowImportModal(true); setImportFile(null); setImportPreview(null); setImportResult(null); }} className="py-2 bg-white border border-emerald-500 text-emerald-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 shadow-sm transition-all active:scale-[0.98]">
                        <span className="material-symbols-outlined text-[16px]">upload_file</span> Import Excel
                      </button>
                      <button onClick={() => { setShowTemplateModal(true); setTemplateView('list'); fetchTemplates(); }} className="py-2 bg-white border border-indigo-500 text-indigo-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-indigo-50 shadow-sm transition-all active:scale-[0.98]">
                        <span className="material-symbols-outlined text-[16px]">bookmark</span> Template
                      </button>
                    </div>
                  </div>
                )}
                {canWrite && activeTab === 'map' && (
                  <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0">
                    <button onClick={() => { setShowAddPetugasModal(true); fetchAvailablePetugas(); setSelectedNipps([]); setSearchPetugas(''); }} className="w-full py-2.5 bg-white border border-primary text-primary rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/5 shadow-sm transition-all active:scale-[0.98]">
                      <span className="material-symbols-outlined text-[18px]">person_add</span> Tambah Petugas Kelolaan
                    </button>
                  </div>
                )}
              </div>
            </aside>

            {/* Right Area — Task List Detail / Summary */}
            <main className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
              {/* Penugasan summary with large cards */}
              <div className="flex-1 overflow-y-auto p-6">
                <h2 className="text-lg font-extrabold text-slate-800 mb-1 tracking-tight">Daftar Penugasan PPJ</h2>
                <p className="text-sm text-slate-500 mb-6">Kelola tugas inspeksi jalur petugas Anda</p>
                
                {tugas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">assignment</span>
                    <p className="text-slate-500 font-medium">Belum ada tugas yang dibuat.</p>
                    <p className="text-slate-400 text-sm mt-1">Gunakan panel di sebelah kiri untuk membuat penugasan baru.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {tugas.map(t => {
                      const latestTracking = t.tracking?.[0];
                      const laporanCount = latestTracking?.laporan?.length ?? 0;
                      return (
                        <div key={t.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-5 hover:border-primary/30 transition-all group relative overflow-hidden">
                          <div className={`absolute top-0 left-0 w-1.5 h-full ${t.status === 'completed' ? 'bg-emerald-500' : t.status === 'in_progress' ? 'bg-primary' : 'bg-slate-300'}`}></div>
                          <div className="pl-3">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-sm leading-snug truncate">{t.jalur}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: petugasColor(t.user?.nipp || '') }}>
                                    {t.user?.nama?.substring(0, 2).toUpperCase()}
                                  </div>
                                  <span className="text-xs text-primary font-semibold">{t.user?.nama}</span>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200">
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                <span className="font-semibold">{new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <span className="material-symbols-outlined text-[14px]">route</span>
                                <span className="font-semibold">{haversineKm(t.startPointLat, t.startPointLong, t.endPointLat, t.endPointLong)} km</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <span className="material-symbols-outlined text-[14px]">flag</span>
                                <span className="font-semibold">{laporanCount} laporan</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          </div>
        )}

        {/* ── LIVE VIEW ──────────────────────────────────────── */}
        {activeMenu === 'liveview' && (
          <main className="flex-1 overflow-hidden flex flex-col relative isolate m-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <AdminMap
              emergencies={mapEmergencies}
              tasks={mapTasks}
              onEmergencyClick={(em) => { setSelectedEmergency(emergencies.find(e => e.id === em.id) || null); }}
            />

            {/* Legend */}
            <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-md border border-slate-200 z-[1000]">
              <p className="text-slate-500 uppercase font-bold text-[9px] tracking-widest mb-2">Legenda Visual</p>
              <div className="flex flex-col gap-2">
                {[['#94a3b8','Tugas Pending'],['#005bac','Tugas Aktif'],['#22c55e','Selesai']].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: c }} />
                    <span className="text-slate-700 text-[11px] font-semibold">{l}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
                  <span className="text-rose-500 font-bold text-[14px] leading-none w-3 text-center">⚠</span>
                  <span className="text-slate-700 text-[11px] font-semibold">Laporan Darurat</span>
                </div>
              </div>
            </div>
            
            {/* Live Indicator */}
            <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm border border-slate-200 flex items-center gap-2 z-[1000]">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-slate-600 text-[10px] font-bold tracking-widest uppercase">Live Sync</span>
            </div>
          </main>
        )}

        {/* ── AKUN MANAGEMENT VIEW (Admin Only) ────────────── */}
        {activeMenu === 'akun' && isAdmin && (
          <div className="flex flex-1 overflow-hidden p-4 gap-4">
            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">Kelola Akun Pengguna</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Buat, edit, dan kelola akun QC, KUPT, dan PPJ</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                    <input
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                      placeholder="Cari NIPP atau nama..."
                      className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none w-56 font-medium"
                    />
                  </div>
                  <button onClick={handleOpenCreateUser} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]">
                    <span className="material-symbols-outlined text-[18px]">person_add</span> Buat Akun
                  </button>
                </div>
              </div>

              {/* User List */}
              <div className="flex-1 overflow-y-auto p-4">
                {managedUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">group</span>
                    <p className="text-slate-500 font-medium">Belum ada akun yang dibuat.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {managedUsers
                      .filter(u => {
                        if (!userSearchQuery) return true;
                        const q = userSearchQuery.toLowerCase();
                        return u.nipp.toLowerCase().includes(q) || u.nama.toLowerCase().includes(q);
                      })
                      .map(u => (
                        <div key={u.id} className={`bg-slate-50 rounded-2xl border p-5 relative group transition-all ${
                          u.isActive ? 'border-slate-200 hover:border-primary/30' : 'border-rose-200 bg-rose-50/50 opacity-70'
                        }`}>
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-inner shrink-0" style={{ background: petugasColor(u.nipp) }}>
                              {u.nama.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 text-sm truncate">{u.nama}</p>
                              <p className="text-xs text-slate-500 font-medium">{u.nipp}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              u.role === 'qc' ? 'bg-indigo-100 text-indigo-700' :
                              u.role === 'kupt' ? 'bg-teal-100 text-teal-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>{ROLE_LABEL[u.role] || u.role}</span>
                          </div>
                          {u.wilayahAssignments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {u.wilayahAssignments.map(wa => (
                                <span key={wa.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 font-semibold">
                                  {wa.wilayah.kode} {wa.wilayah.nama}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
                            <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                              u.isActive ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                              {u.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                            <span className="flex-1"></span>
                            <button onClick={() => handleOpenEditUser(u)} className="text-slate-400 hover:text-primary transition-colors p-1 rounded hover:bg-primary/5">
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            <button onClick={() => handleToggleUserActive(u)} className={`transition-colors p-1 rounded ${u.isActive ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                              <span className="material-symbols-outlined text-[18px]">{u.isActive ? 'person_off' : 'person'}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit User Modal (Admin Only) */}
      {showUserModal && isAdmin && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-primary text-[20px]">{editingUser ? 'edit' : 'person_add'}</span>
                {editingUser ? 'EDIT AKUN' : 'BUAT AKUN BARU'}
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1 bg-slate-50/50">
              {/* NIPP */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">NIPP</label>
                <input value={userForm.nipp} onChange={e => setUserForm(f => ({ ...f, nipp: e.target.value }))} disabled={!!editingUser} placeholder="Contoh: QC-A001" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium disabled:bg-slate-100 disabled:text-slate-400" />
              </div>
              {/* Nama */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Nama Lengkap</label>
                <input value={userForm.nama} onChange={e => setUserForm(f => ({ ...f, nama: e.target.value }))} placeholder="Nama pengguna" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>
              {/* Password */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">{editingUser ? 'Password Baru (opsional)' : 'Password'}</label>
                <input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Min. 6 karakter'} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>
              {/* Role */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Role</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value, wilayahIds: [] }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium">
                  <option value="ppj">PPJ (Petugas Pemeriksa Jalur)</option>
                  <option value="qc">QC (Quality Control)</option>
                  <option value="kupt">KUPT</option>
                </select>
              </div>
              {/* Wilayah (for QC/KUPT) */}
              {(userForm.role === 'qc' || userForm.role === 'kupt') && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
                    Wilayah {userForm.role === 'kupt' ? '(Pilih 1)' : '(Pilih beberapa)'}
                  </label>
                  <div className="border border-slate-300 rounded-xl bg-white p-3 max-h-48 overflow-y-auto space-y-2">
                    {allWilayah.map(w => {
                      const checked = userForm.wilayahIds.includes(w.id);
                      return (
                        <label key={w.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-primary/5 border border-primary/20' : 'hover:bg-slate-50 border border-transparent'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setUserForm(f => {
                                if (f.role === 'kupt') {
                                  return { ...f, wilayahIds: checked ? [] : [w.id] };
                                }
                                return { ...f, wilayahIds: checked ? f.wilayahIds.filter(id => id !== w.id) : [...f.wilayahIds, w.id] };
                              });
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-slate-800">{w.kode}</span>
                            <span className="text-xs text-slate-500 ml-2">{w.nama}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {userForm.wilayahIds.length > 0 && (
                    <p className="text-xs text-primary font-semibold mt-2">{userForm.wilayahIds.length} wilayah dipilih</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button onClick={handleSaveUser} disabled={savingUser} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">save</span>
                {savingUser ? 'Menyimpan...' : (editingUser ? 'Simpan Perubahan' : 'Buat Akun')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Detail Modal */}
      {selectedEmergency && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-rose-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-[20px]">warning</span> DETAIL INSIDEN DARURAT
              </h3>
              <button onClick={() => setSelectedEmergency(null)} className="text-white/70 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            {selectedEmergency.foto && <div className="w-full h-56 bg-slate-100"><img src={selectedEmergency.foto} alt="darurat" className="w-full h-full object-cover" /></div>}
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-md text-xs font-extrabold uppercase tracking-widest">{JENIS_LABEL[selectedEmergency.jenisTemuan] ?? selectedEmergency.jenisTemuan}</span>
                <span className="text-xs font-semibold text-slate-500">{new Date(selectedEmergency.createdAt).toLocaleString('id-ID')}</span>
              </div>
              {selectedEmergency.deskripsi && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">{selectedEmergency.deskripsi}</p>
                </div>
              )}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-inner space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Pelapor</p>
                  <p className="text-sm font-bold text-slate-800">{selectedEmergency.tracking?.tugas?.user?.nama}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Jalur</p>
                  <p className="text-sm font-bold text-slate-800 text-right">{selectedEmergency.tracking?.tugas?.jalur}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">GPS</p>
                  <p className="text-xs font-bold text-slate-700 font-mono bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                    {selectedEmergency.latitude.toFixed(6)}, {selectedEmergency.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide"><span className="material-symbols-outlined text-primary text-[20px]">add_task</span> TUGASKAN PETUGAS</h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-white transition-colors flex items-center"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1 bg-slate-50/50">
              {/* Petugas */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Pilih Petugas Pemeriksa</label>
                <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium">
                  <option value="">-- Silakan Pilih Petugas --</option>
                  {petugas.map(p => <option key={p.id} value={p.id}>{p.nama} ({p.nipp})</option>)}
                </select>
              </div>

              {/* Station Dropdowns */}
              <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-widest block mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[16px]">train</span> Titik Lokasi Pengecekan
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start Station */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">trip_origin</span> Stasiun Awal
                    </label>
                    <select
                      value={form.startPointName}
                      onChange={e => handleStartStationChange(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-sm font-medium"
                    >
                      <option value="">-- Pilih Stasiun Awal --</option>
                      {filteredStations.map(s => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.lat.toFixed(4)}, {s.lng.toFixed(4)})
                        </option>
                      ))}
                    </select>

                    {form.startPointLat && (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        {form.startPointLat}, {form.startPointLong}
                      </div>
                    )}
                  </div>
                  {/* End Station */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-rose-600 uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">location_on</span> Stasiun Akhir
                    </label>
                    <select
                      value={form.endPointName}
                      onChange={e => handleEndStationChange(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none shadow-sm font-medium"
                    >
                      <option value="">-- Pilih Stasiun Akhir --</option>
                      {filteredStations.map(s => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.lat.toFixed(4)}, {s.lng.toFixed(4)})
                        </option>
                      ))}
                    </select>
                    {form.endPointLat && (
                      <div className="flex items-center gap-1.5 text-[10px] text-rose-600 font-semibold bg-rose-50 rounded-lg px-3 py-1.5 border border-rose-100">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        {form.endPointLat}, {form.endPointLong}
                      </div>
                    )}
                  </div>
                </div>
                {form.startPointLat && form.endPointLat && (
                  <div className="mt-4 flex items-center justify-between bg-blue-50 py-2.5 px-4 rounded-lg border border-blue-100">
                    <span className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Estimasi Jarak</span>
                    <span className="text-sm font-extrabold text-blue-700">{haversineKm(parseFloat(form.startPointLat), parseFloat(form.startPointLong), parseFloat(form.endPointLat), parseFloat(form.endPointLong))} km</span>
                  </div>
                )}
              </div>

              {/* Nama Jalur */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Nama Jalur Inspeksi</label>
                <input value={form.jalur} onChange={e => setForm(f => ({ ...f, jalur: e.target.value }))} placeholder="Otomatis terisi dari stasiun yang dipilih" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>

              {/* Tanggal */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Tanggal Inspeksi</label>
                <input type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
              </div>

              {/* Jam Mulai & Jam Selesai */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-emerald-600">schedule</span> Jam Mulai
                  </label>
                  <input type="time" value={form.jamMulai} onChange={e => setForm(f => ({ ...f, jamMulai: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-rose-600">schedule</span> Jam Selesai
                  </label>
                  <input type="time" value={form.jamSelesai} onChange={e => setForm(f => ({ ...f, jamSelesai: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm font-medium" />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              <button onClick={() => setShowTaskModal(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button onClick={handleCreateTugas} disabled={submitting} className="flex-[2] py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">send</span>
                {submitting ? 'Menyimpan...' : 'Simpan & Tugaskan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Petugas Modal */}
      {showAddPetugasModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3"><span className="material-symbols-outlined text-primary text-[20px]">person_add</span> TAMBAH PETUGAS</h3>
              <button onClick={() => setShowAddPetugasModal(false)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="p-5 border-b border-slate-100 shrink-0">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  value={searchPetugas} 
                  onChange={e => setSearchPetugas(e.target.value)} 
                  placeholder="Cari nama atau NIPP petugas..." 
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50">
              {availablePetugas.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">Tidak ada petugas yang tersedia.</div>
              ) : (
                <div className="space-y-1.5 p-2">
                  {availablePetugas
                    .filter(p => p.nama.toLowerCase().includes(searchPetugas.toLowerCase()) || p.nipp.toLowerCase().includes(searchPetugas.toLowerCase()))
                    .map(p => {
                      const isSelected = selectedNipps.includes(p.nipp);
                      return (
                        <button 
                          key={p.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedNipps(prev => prev.filter(n => n !== p.nipp));
                            } else {
                              setSelectedNipps(prev => [...prev, p.nipp]);
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSelected ? 'bg-primary-container/10 border-primary shadow-sm' : 'bg-white border-slate-200 hover:border-primary/50 hover:bg-slate-50'}`}
                        >
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style={{ background: petugasColor(p.nipp) }}>
                            {p.nama.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold truncate text-sm ${isSelected ? 'text-primary' : 'text-slate-800'}`}>{p.nama}</p>
                            <p className="text-xs text-slate-500 font-medium">{p.nipp}</p>
                          </div>
                          {isSelected ? (
                            <span className="material-symbols-outlined text-primary">check_circle</span>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300"></div>
                          )}
                        </button>
                      );
                  })}
                  {availablePetugas.filter(p => p.nama.toLowerCase().includes(searchPetugas.toLowerCase()) || p.nipp.toLowerCase().includes(searchPetugas.toLowerCase())).length === 0 && (
                    <div className="p-4 text-center text-slate-500 text-sm">Pencarian tidak ditemukan.</div>
                  )}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0">
              <button onClick={() => setShowAddPetugasModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Batal</button>
              <button onClick={handleAddPetugas} disabled={addingPetugas || selectedNipps.length === 0} className="flex-[2] py-2.5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                {addingPetugas ? 'Menambahkan...' : `Tambahkan (${selectedNipps.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat Pekerjaan Modal */}
      {selectedPetugasHistory && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-inner shrink-0" style={{ background: petugasColor(selectedPetugasHistory.nipp) }}>
                  {selectedPetugasHistory.nama.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedPetugasHistory.nama}</h3>
                  <p className="text-xs text-slate-400">{selectedPetugasHistory.nipp}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPetugasHistory(null)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Riwayat Pekerjaan Tracking</h4>
              <div className="space-y-3">
                {tugas.filter(t => t.user.nipp === selectedPetugasHistory.nipp).length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">history</span>
                    <p className="text-slate-500 text-sm font-medium">Belum ada riwayat pekerjaan.</p>
                  </div>
                ) : (
                  tugas.filter(t => t.user.nipp === selectedPetugasHistory.nipp).map(t => {
                    const latestTracking = t.tracking?.[0];
                    const laporanList = latestTracking?.laporan || [];
                    
                    return (
                      <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden mb-4">
                        <div className={`absolute top-0 left-0 w-1.5 h-full ${t.status === 'completed' ? 'bg-primary' : t.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                        
                        <div className="p-4 pl-5 border-b border-slate-100">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <p className="font-bold text-slate-800 text-sm leading-snug">{t.jalur}</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span> 
                            {new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                          <div className="flex items-center gap-4 pt-2">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">route</span>
                              <span className="font-semibold">{haversineKm(t.startPointLat, t.startPointLong, t.endPointLat, t.endPointLong)} km</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">timer</span>
                              <span className="font-semibold">{
                                latestTracking?.durasi
                                  ? latestTracking.durasi >= 3600
                                    ? `${Math.floor(latestTracking.durasi / 3600)} jam ${Math.floor((latestTracking.durasi % 3600) / 60)} menit`
                                    : latestTracking.durasi >= 60
                                    ? `${Math.floor(latestTracking.durasi / 60)} menit`
                                    : `${latestTracking.durasi} detik`
                                  : latestTracking?.startTime && latestTracking?.endTime
                                  ? `${Math.floor((new Date(latestTracking.endTime).getTime() - new Date(latestTracking.startTime).getTime()) / 60000)} menit`
                                  : '-'
                              }</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <span className="material-symbols-outlined text-[16px] text-slate-400">flag</span>
                              <span className="font-semibold">{laporanList.length} laporan</span>
                            </div>
                          </div>
                        </div>

                        {/* Detail Laporan Kendala */}
                        {laporanList.length > 0 && (
                          <div className="bg-slate-50 p-4 pl-5">
                            <h5 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-2">
                              <span className="material-symbols-outlined text-rose-500 text-[16px]">warning</span> Laporan Kendala
                            </h5>
                            <div className="space-y-3">
                              {laporanList.map((lap, idx) => (
                                <div key={lap.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                  {lap.foto && (
                                    <div className="w-full h-32 relative">
                                      <img src={lap.foto} alt={`Foto kendala ${idx + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                  )}
                                  <div className="p-3 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${JENIS_COLOR[lap.jenisTemuan] ?? 'bg-slate-100 text-slate-700'}`}>
                                        {JENIS_LABEL[lap.jenisTemuan] ?? lap.jenisTemuan}
                                      </span>
                                      <span className="font-medium text-[10px] text-slate-500">
                                        {new Date(lap.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                      </span>
                                    </div>
                                    {lap.deskripsi && <p className="text-xs text-slate-700">{lap.deskripsi}</p>}
                                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                      <span className="material-symbols-outlined text-[14px]">location_on</span>
                                      <span>{lap.latitude.toFixed(5)}, {lap.longitude.toFixed(5)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {laporanList.length === 0 && (
                          <div className="bg-slate-50 p-3 pl-5 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                              <span className="material-symbols-outlined text-emerald-500 text-[18px]">verified</span>
                              Tidak ada kendala yang dilaporkan.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ IMPORT EXCEL MODAL ═══ */}
      {showImportModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-emerald-700 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-[20px]">upload_file</span> IMPORT JADWAL DARI EXCEL
              </h3>
              <button onClick={handleCloseImport} className="text-white/70 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1 bg-slate-50/50">
              {/* Download Template */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-800">Template Excel</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Unduh template untuk memastikan format file yang benar</p>
                </div>
                <button onClick={handleDownloadTemplate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-700 shadow-sm transition-all active:scale-[0.98]">
                  <span className="material-symbols-outlined text-[16px]">download</span> Download
                </button>
              </div>

              {/* Drop Zone */}
              {!importResult && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    dragOver ? 'border-emerald-500 bg-emerald-50' : importFile ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/30'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                  <span className={`material-symbols-outlined text-4xl mb-3 block ${importFile ? 'text-emerald-500' : 'text-slate-300'}`}>{importFile ? 'check_circle' : 'cloud_upload'}</span>
                  {importFile ? (
                    <>
                      <p className="text-sm font-bold text-emerald-700">{importFile.name}</p>
                      <p className="text-xs text-emerald-600 mt-1">{(importFile.size / 1024).toFixed(1)} KB — Klik untuk ganti file</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-slate-600">Drag & drop file Excel di sini</p>
                      <p className="text-xs text-slate-400 mt-1">atau klik untuk pilih file (.xlsx)</p>
                    </>
                  )}
                </div>
              )}

              {/* Preview Table */}
              {importPreview && !importResult && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Preview Data</p>
                    <p className="text-[10px] text-slate-500">Menampilkan maks. 10 baris pertama</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          {importPreview[0]?.map((h: string, i: number) => (
                            <th key={i} className="px-3 py-2 text-left font-bold text-slate-600 border-b border-slate-200 whitespace-nowrap">{String(h)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(1).map((row: any[], rIdx: number) => (
                          <tr key={rIdx} className="hover:bg-slate-50">
                            {row.map((cell: any, cIdx: number) => (
                              <td key={cIdx} className="px-3 py-1.5 border-b border-slate-100 text-slate-700 whitespace-nowrap">{String(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Result */}
              {importResult && (
                <div className="space-y-4">
                  <div className={`rounded-xl p-4 border ${importResult.imported > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`material-symbols-outlined text-3xl ${importResult.imported > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{importResult.imported > 0 ? 'check_circle' : 'error'}</span>
                      <div>
                        <p className={`font-bold text-sm ${importResult.imported > 0 ? 'text-emerald-800' : 'text-rose-800'}`}>{importResult.imported} tugas berhasil diimport</p>
                        {importResult.errors > 0 && <p className="text-xs text-rose-600 mt-0.5">{importResult.errors} baris bermasalah</p>}
                      </div>
                    </div>
                  </div>
                  {importResult.errorDetails?.length > 0 && (
                    <div className="bg-white rounded-xl border border-rose-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200">
                        <p className="text-xs font-bold text-rose-700 uppercase tracking-wider">Detail Error</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {importResult.errorDetails.map((err, i) => (
                          <div key={i} className="px-4 py-2 border-b border-rose-100 flex gap-3 items-start text-xs">
                            <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold shrink-0">Baris {err.row}</span>
                            <span className="text-rose-600">{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              <button onClick={handleCloseImport} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">{importResult ? 'Tutup' : 'Batal'}</button>
              {!importResult && (
                <button onClick={handleImportExcel} disabled={!importFile || importing} className="flex-[2] py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[18px]">publish</span>
                  {importing ? 'Mengimport...' : 'Import Semua'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TEMPLATE PENUGASAN MODAL ═══ */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-indigo-700 px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-[20px]">bookmark</span>
                {templateView === 'list' ? 'TEMPLATE PENUGASAN' : templateView === 'create' ? 'BUAT TEMPLATE BARU' : 'TERAPKAN TEMPLATE'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-white/70 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="overflow-y-auto flex-1 bg-slate-50/50">
              {/* ─── LIST VIEW ─── */}
              {templateView === 'list' && (
                <div className="p-6 space-y-4">
                  {templates.length === 0 ? (
                    <div className="text-center py-12">
                      <span className="material-symbols-outlined text-slate-200 text-5xl mb-3 block">bookmark_border</span>
                      <p className="text-slate-500 text-sm font-medium">Belum ada template penugasan.</p>
                      <p className="text-slate-400 text-xs mt-1">Buat template untuk mempercepat pembuatan jadwal.</p>
                    </div>
                  ) : (
                    templates.map(t => (
                      <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-indigo-300 transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{t.nama}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{t.items.length} rute • Dibuat {new Date(t.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => { setSelectedTemplate(t); setTemplateView('apply'); setApplyDates({ startDate: '', endDate: '' }); }} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-100 transition-colors flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">play_arrow</span> Terapkan
                            </button>
                            <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {t.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: petugasColor(item.petugasNipp || '') }}>
                                {(item.petugasNama || '?').substring(0, 2).toUpperCase()}
                              </span>
                              <span className="font-semibold text-slate-700 truncate">{item.petugasNama || 'Petugas ?'}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-600 truncate">{item.startPointName} → {item.endPointName}</span>
                              {item.jamMulai && <span className="text-slate-400 shrink-0">{item.jamMulai}-{item.jamSelesai || '?'}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ─── CREATE VIEW ─── */}
              {templateView === 'create' && (
                <div className="p-6 space-y-5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Nama Template</label>
                    <input value={templateForm.nama} onChange={e => setTemplateForm(f => ({ ...f, nama: e.target.value }))} placeholder="Contoh: Jadwal Harian Sektor A" className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm font-medium" />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Item Rute</label>
                    <div className="space-y-3">
                      {templateForm.items.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 relative group">
                          {templateForm.items.length > 1 && (
                            <button onClick={() => handleRemoveTemplateItem(idx)} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-rose-600 hover:border-rose-300 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10">
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Petugas</label>
                              <select value={item.assignedTo} onChange={e => handleTemplateItemChange(idx, 'assignedTo', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                                <option value="">-- Pilih --</option>
                                {petugas.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest block mb-1">Stasiun Awal</label>
                              <select value={item.startPointName} onChange={e => handleTemplateItemChange(idx, 'startPointName', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
                                <option value="">-- Pilih --</option>
                                {filteredStations.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-rose-500 uppercase tracking-widest block mb-1">Stasiun Akhir</label>
                              <select value={item.endPointName} onChange={e => handleTemplateItemChange(idx, 'endPointName', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 outline-none">
                                <option value="">-- Pilih --</option>
                                {filteredStations.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Jam Mulai</label>
                              <input type="time" value={item.jamMulai} onChange={e => handleTemplateItemChange(idx, 'jamMulai', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Jam Selesai</label>
                              <input type="time" value={item.jamSelesai} onChange={e => handleTemplateItemChange(idx, 'jamSelesai', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleAddTemplateItem} className="mt-3 w-full py-2 border-2 border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">add</span> Tambah Rute
                    </button>
                  </div>
                </div>
              )}

              {/* ─── APPLY VIEW ─── */}
              {templateView === 'apply' && selectedTemplate && (
                <div className="p-6 space-y-5">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                    <p className="text-sm font-bold text-indigo-800">{selectedTemplate.nama}</p>
                    <p className="text-xs text-indigo-600 mt-0.5">{selectedTemplate.items.length} rute akan digenerate untuk setiap tanggal dalam rentang</p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Rentang Tanggal</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest block mb-1">Tanggal Mulai</label>
                        <input type="date" value={applyDates.startDate} onChange={e => setApplyDates(d => ({ ...d, startDate: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm font-medium" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-rose-600 uppercase tracking-widest block mb-1">Tanggal Akhir</label>
                        <input type="date" value={applyDates.endDate} onChange={e => setApplyDates(d => ({ ...d, endDate: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm font-medium" />
                      </div>
                    </div>
                    {applyDates.startDate && applyDates.endDate && (
                      <div className="mt-3 bg-indigo-50 py-2 px-4 rounded-lg border border-indigo-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-widest">Total Tugas</span>
                        <span className="text-sm font-extrabold text-indigo-700">
                          {(() => {
                            const d = Math.ceil((new Date(applyDates.endDate).getTime() - new Date(applyDates.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            return d > 0 ? `${d} hari × ${selectedTemplate.items.length} rute = ${d * selectedTemplate.items.length} tugas` : 'Tanggal tidak valid';
                          })()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Preview items */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rute dalam template</p>
                    {selectedTemplate.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-slate-200">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: petugasColor(item.petugasNipp || '') }}>
                          {(item.petugasNama || '?').substring(0, 2).toUpperCase()}
                        </span>
                        <span className="font-semibold text-slate-700">{item.petugasNama}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600">{item.startPointName} → {item.endPointName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-200 flex gap-3 shrink-0 bg-white">
              {templateView === 'list' && (
                <>
                  <button onClick={() => setShowTemplateModal(false)} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Tutup</button>
                  <button onClick={() => { setTemplateView('create'); setTemplateForm({ nama: '', items: [{ assignedTo: '', startPointName: '', endPointName: '', jamMulai: '', jamSelesai: '' }] }); }} className="flex-[2] py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98] uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px]">add</span> Buat Template Baru
                  </button>
                </>
              )}
              {templateView === 'create' && (
                <>
                  <button onClick={() => setTemplateView('list')} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Kembali</button>
                  <button onClick={handleCreateTemplate} disabled={savingTemplate} className="flex-[2] py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    {savingTemplate ? 'Menyimpan...' : 'Simpan Template'}
                  </button>
                </>
              )}
              {templateView === 'apply' && (
                <>
                  <button onClick={() => { setTemplateView('list'); setSelectedTemplate(null); }} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors uppercase tracking-wider">Kembali</button>
                  <button onClick={handleApplyTemplate} disabled={applyingTemplate || !applyDates.startDate || !applyDates.endDate} className="flex-[2] py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-60 transition-all active:scale-[0.98] uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    {applyingTemplate ? 'Membuat Tugas...' : 'Terapkan & Generate Tugas'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
