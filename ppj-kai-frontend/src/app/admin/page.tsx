'use client';
import { formatDistanceKm as haversineKm } from '../../../../shared/geo';
import { petugasColor } from '../../../../shared/display';
import AdminAccounts from '../../components/admin/AdminAccounts';
import AdminSettings from '../../components/admin/AdminSettings';
import AssignmentEditor from '../../components/admin/AssignmentEditor';
import CategoryEditor from '../../components/admin/CategoryEditor';
import ImportResult from '../../components/admin/ImportResult';
import PetugasHistory from '../../components/admin/PetugasHistory';
import PetugasPicker from '../../components/admin/PetugasPicker';
import type { Emergency,KategoriTemuan,ManagedUser,Petugas,RegisteredMapLocation,Stats,Tugas,TugasStatusFilter,WilayahItem } from '../../components/admin/types';
import UserEditor from '../../components/admin/UserEditor';


import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import React,{ useCallback,useEffect,useState } from 'react';
import TaskDetailModal from '../../components/admin/TaskDetailModal';
import { useLivePositions } from '../../hooks/useLivePositions';
import api from '../../lib/api';
import { NotificationSound,playNotification,speakEmergencyAnnouncement,startLoopingNotification,stopLoopingNotification } from '../../lib/audio';
import { showConfirm } from '../../lib/confirm';
import { STATIONS } from '../../lib/stations';
import { showToast } from '../../lib/toast';
import { resolveTugasStatus } from '../../lib/tugasStatus';
import { getApiErrorMessage } from '../../lib/utils';

// Same deterministic color as AdminMap — NIPP → unique HSL color


const AdminMap = dynamic(() => import('../../components/map/AdminMap'), { ssr: false });
const AdminLocationMap = dynamic(() => import('../../components/map/AdminLocationMap'), { ssr: false });












const ROLE_BADGE: Record<string, { label: string; bg: string }> = {
  admin: { label: 'Super Admin', bg: 'bg-slate-800' },
  qc: { label: 'Quality Control', bg: 'bg-indigo-600' },
  kupt: { label: 'KUPT', bg: 'bg-teal-600' },
};
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', qc: 'QC', kupt: 'KUPT', guest: 'Guest', ppj: 'PPJ' };

const STATUS_COLOR: Record<string, string> = { pending: 'bg-surface-container text-on-surface-variant border-outline-variant', in_progress: 'bg-primary-container/20 text-primary border-primary/30', need_approval: 'bg-amber-100 text-amber-800 border-amber-300', completed: 'bg-primary-fixed text-on-primary-fixed-variant border-transparent' };
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', in_progress: 'Berlangsung', need_approval: 'Butuh Approval', completed: 'Selesai' };

const TUGAS_STATUS_FILTERS: readonly { value: TugasStatusFilter; label: string; icon: string }[] = [
  { value: 'all', label: 'Semua', icon: 'view_list' },
  { value: 'pending', label: 'Pending', icon: 'schedule' },
  { value: 'in_progress', label: 'Berlangsung', icon: 'directions_walk' },
  { value: 'need_approval', label: 'Butuh Approval', icon: 'approval' },
  { value: 'completed', label: 'Selesai', icon: 'check_circle' },
];
const STATUS_FILTER_ACTIVE: Record<TugasStatusFilter, string> = {
  all: 'bg-slate-800 text-white border-slate-800 shadow-sm',
  pending: 'bg-slate-600 text-white border-slate-600 shadow-sm',
  in_progress: 'bg-primary text-white border-primary shadow-sm',
  need_approval: 'bg-amber-400 text-amber-950 border-amber-400 shadow-sm',
  completed: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
};

const ALERT_SOUND_STORAGE_KEY = 'admin_alert_sound';
const ALERT_SOUND_OPTIONS: NotificationSound[] = ['off', 'siren', 'beep', 'chime'];

function isNotificationSound(value: unknown): value is NotificationSound {
  return typeof value === 'string' && ALERT_SOUND_OPTIONS.includes(value as NotificationSound);
}

// Predefined icon options for admin to pick from when creating categories
const ICON_OPTIONS = [
  'construction', 'broken_image', 'block', 'more_horiz', 'warning', 'error',
  'track_changes', 'report_problem', 'dangerous', 'flood', 'landslide',
  'electric_bolt', 'forest', 'fence', 'foundation', 'hardware',
  'remove_road', 'train', 'railway_alert', 'crisis_alert',
];

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id?: number; nama: string; role: string } | null>(null);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [petugas, setPetugas] = useState<Petugas[]>([]);
  const [tugas, setTugas] = useState<Tugas[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);

  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'tasks' | 'emergency'>('map');

  // Sidebar menu state
  const [activeMenu, setActiveMenu] = useState<'penugasan' | 'liveview' | 'locationmap' | 'akun' | 'settings'>('penugasan');

  const { positions: livePositions, error: liveError } = useLivePositions(!!user && activeMenu === 'liveview');

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
  const [userForm, setUserForm] = useState({ nipp: '', nama: '', password: '', role: 'ppj' as string, wilayahIds: [] as number[], petugasIds: [] as number[] });
  const [managedPetugasSearch, setManagedPetugasSearch] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Task list filter state
  const [tugasSearchQuery, setTugasSearchQuery] = useState('');
  const [tugasStatusFilter, setTugasStatusFilter] = useState<TugasStatusFilter>('all');
  const [tugasDateFrom, setTugasDateFrom] = useState('');
  const [tugasDateTo, setTugasDateTo] = useState('');
  const [selectedTugasDetail, setSelectedTugasDetail] = useState<Tugas | null>(null);
  const [downloadingTugasId, setDownloadingTugasId] = useState<number | null>(null);
  const [approvingTrackingId, setApprovingTrackingId] = useState<number | null>(null);

  // Task form state
  const [form, setForm] = useState({ jalur: '', tanggal: '', assignedTo: '', startPointName: '', endPointName: '', startPointLat: '', startPointLong: '', endPointLat: '', endPointLong: '', startMapLocationId: '', endMapLocationId: '', jamMulai: '', jamSelesai: '' });
  const [submitting, setSubmitting] = useState(false);
  const [registeredMapLocations, setRegisteredMapLocations] = useState<RegisteredMapLocation[]>([]);
  const [loadingTaskLocations, setLoadingTaskLocations] = useState(false);

  const [showAddPetugasModal, setShowAddPetugasModal] = useState(false);
  const [availablePetugas, setAvailablePetugas] = useState<{id: number, nipp: string, nama: string}[]>([]);
  const [searchPetugas, setSearchPetugas] = useState('');
  const [selectedNipps, setSelectedNipps] = useState<string[]>([]);
  const [addingPetugas, setAddingPetugas] = useState(false);

  // History state
  const [selectedPetugasHistory, setSelectedPetugasHistory] = useState<Petugas | null>(null);
  const [petugasHistoryTasks, setPetugasHistoryTasks] = useState<Tugas[]>([]);
  useEffect(() => {
    if (!selectedPetugasHistory) return;
    const controller = new AbortController();
    setPetugasHistoryTasks([]);
    api.get('/admin/tugas', { params: { petugasId: selectedPetugasHistory.id }, signal: controller.signal })
      .then(res => setPetugasHistoryTasks(res.data.data.map(resolveTugasStatus)))
      .catch(error => { if (!controller.signal.aborted) showToast(getApiErrorMessage(error, 'Gagal mengambil riwayat.'), 'error'); });
    return () => controller.abort();
  }, [selectedPetugasHistory]);

  // Excel import state
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; created: number; failed: number; details: { row: number; status: string; message: string; jalur?: string }[] } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Audio Notification State
  const [alertSound, setAlertSound] = useState<NotificationSound>('off');
  const [savingAlertSound, setSavingAlertSound] = useState(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const lastEmergencyId = React.useRef(0);

  // Kategori Temuan State
  const [kategoriList, setKategoriList] = useState<KategoriTemuan[]>([]);
  const [showKategoriModal, setShowKategoriModal] = useState(false);
  const [editingKategori, setEditingKategori] = useState<KategoriTemuan | null>(null);
  const [kategoriForm, setKategoriForm] = useState({ key: '', label: '', icon: 'warning', color: 'error' });
  const [savingKategori, setSavingKategori] = useState(false);
  // Drag & drop reorder state
  const [dragKategoriId, setDragKategoriId] = useState<number | null>(null);
  const [dragOverKategoriId, setDragOverKategoriId] = useState<number | null>(null);
  const [reorderingKategori, setReorderingKategori] = useState(false);

  // Derived label/color maps from kategoriList
  const JENIS_LABEL: Record<string, string> = React.useMemo(() => {
    const map: Record<string, string> = {};
    kategoriList.forEach(k => { map[k.key] = k.label; });
    return map;
  }, [kategoriList]);
  const JENIS_COLOR: Record<string, string> = React.useMemo(() => {
    const map: Record<string, string> = {};
    kategoriList.forEach(k => {
      map[k.key] = k.color === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700';
    });
    return map;
  }, [kategoriList]);

  // Search and date filters are applied before status counts so each tab remains informative.
  const tugasInSearchAndDate = React.useMemo(() => {
    const q = tugasSearchQuery.trim().toLowerCase();
    return tugas.filter(t => {
      const taskDate = t.tanggal.slice(0, 10);
      if (tugasDateFrom && taskDate < tugasDateFrom) return false;
      if (tugasDateTo && taskDate > tugasDateTo) return false;
      if (!q) return true;
      return (
        t.jalur.toLowerCase().includes(q) ||
        (t.user?.nama?.toLowerCase().includes(q) ?? false) ||
        (t.user?.nipp?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [tugas, tugasSearchQuery, tugasDateFrom, tugasDateTo]);

  const tugasStatusCounts = React.useMemo<Record<TugasStatusFilter, number>>(() => ({
    all: tugasInSearchAndDate.length,
    pending: tugasInSearchAndDate.filter(t => t.status === 'pending').length,
    in_progress: tugasInSearchAndDate.filter(t => t.status === 'in_progress').length,
    need_approval: tugasInSearchAndDate.filter(t => t.status === 'need_approval').length,
    completed: tugasInSearchAndDate.filter(t => t.status === 'completed').length,
  }), [tugasInSearchAndDate]);

  const filteredTugas = React.useMemo(() => tugasStatusFilter === 'all'
    ? tugasInSearchAndDate
    : tugasInSearchAndDate.filter(t => t.status === tugasStatusFilter),
  [tugasInSearchAndDate, tugasStatusFilter]);

  // Load alert sound preference
  useEffect(() => {
    const savedSound = localStorage.getItem(ALERT_SOUND_STORAGE_KEY);
    if (isNotificationSound(savedSound)) {
      setAlertSound(savedSound);
    }
  }, []);

  // Cleanup looping alarm on unmount
  useEffect(() => {
    return () => {
      stopLoopingNotification();
    };
  }, []);

  // Play looping sound + TTS only for new reports whose category is marked
  // Darurat (red/error). Ringan reports remain visible without sounding an alarm.
  useEffect(() => {
    if (emergencies.length === 0 || kategoriList.length === 0) return;

    const latestId = Math.max(...emergencies.map(e => e.id));
    if (lastEmergencyId.current === 0) {
      lastEmergencyId.current = latestId;
      return;
    }

    const categorySeverity = new Map(kategoriList.map(category => [category.key, category.color]));
    const newestDarurat = emergencies
      .filter(report => report.id > lastEmergencyId.current)
      .filter(report => {
        const configuredSeverity = categorySeverity.get(report.jenisTemuan);
        if (configuredSeverity) return configuredSeverity === 'error';
        return report.jenisTemuan === 'emergency' || report.jenisTemuan === 'berat';
      })
      .sort((a, b) => b.id - a.id)[0];

    lastEmergencyId.current = Math.max(lastEmergencyId.current, latestId);
    if (!newestDarurat || alertSound === 'off') return;

    startLoopingNotification(alertSound);
    setIsAlarmActive(true);

    const announcementTimer = window.setTimeout(() => {
      const petugasNama = newestDarurat.tracking?.tugas?.user?.nama || 'Petugas';
      speakEmergencyAnnouncement(newestDarurat.jenisTemuan, newestDarurat.deskripsi, petugasNama);
    }, 2500);

    return () => window.clearTimeout(announcementTimer);
  }, [emergencies, alertSound, kategoriList]);

  const handleStopAlarm = () => {
    stopLoopingNotification();
    setIsAlarmActive(false);
  };

  const handleAlertSoundChange = async (sound: NotificationSound) => {
    const previousSound = alertSound;
    setAlertSound(sound);
    localStorage.setItem(ALERT_SOUND_STORAGE_KEY, sound);
    setSavingAlertSound(true);

    try {
      await api.patch('/auth/profile', { alertSound: sound });
      if (sound !== 'off') playNotification(sound);
      showToast('Pengaturan sirine berhasil disimpan.', 'success');
    } catch (error) {
      setAlertSound(previousSound);
      localStorage.setItem(ALERT_SOUND_STORAGE_KEY, previousSound);
      showToast(getApiErrorMessage(error, 'Gagal menyimpan pengaturan sirine.'), 'error');
    } finally {
      setSavingAlertSound(false);
    }
  };

  const fetchAvailablePetugas = async () => {
    try {
      const res = await api.get('/admin/petugas/available');
      setAvailablePetugas(res.data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAll = useCallback(async () => {
    setRefreshingDashboard(true);
    const results = await Promise.allSettled([
      api.get('/admin/stats', { timeout: 12000 }).then(res => setStats(res.data.data)),
      api.get('/admin/petugas', { timeout: 12000 }).then(res => setPetugas(res.data.data)),
      api.get('/admin/tugas', { params: { summary: true }, timeout: 12000 }).then(res => setTugas((Array.isArray(res.data.data) ? res.data.data : []).map(resolveTugasStatus))),
      api.get('/admin/emergency', { timeout: 12000 }).then(res => setEmergencies(res.data.data)),
    ]);
    for (const result of results) if (result.status === 'rejected') console.error('Dashboard refresh failed:', result.reason);
    setRefreshingDashboard(false);
  }, []);

  const detailRequest = React.useRef(0);
  const openTugasDetail = async (task: Tugas) => {
    const requestId = ++detailRequest.current;
    setSelectedTugasDetail(task);
    try {
      const res = await api.get(`/admin/tugas/${task.id}`);
      setSelectedTugasDetail(previous => detailRequest.current === requestId && previous?.id === task.id ? resolveTugasStatus(res.data.data) : previous);
    } catch (error) { showToast(getApiErrorMessage(error, 'Gagal mengambil detail tugas.'), 'error'); }
  };

  // Fetch kategori temuan
  const fetchKategori = useCallback(async () => {
    try {
      const res = await api.get('/admin/kategori-temuan');
      setKategoriList(res.data.data);
    } catch (e) { console.error(e); }
  }, []);

  // Persist a reordered list (drag & drop). Optimistic update with rollback on failure.
  const persistKategoriOrder = useCallback(async (ordered: KategoriTemuan[]) => {
    const previous = kategoriList;
    setKategoriList(ordered);
    setReorderingKategori(true);
    try {
      await api.patch('/admin/kategori-temuan/reorder', { order: ordered.map(k => k.id) });
    } catch (err: unknown) {
      setKategoriList(previous);
      showToast(getApiErrorMessage(err, 'Gagal menyimpan urutan'), 'error');
    } finally {
      setReorderingKategori(false);
    }
  }, [kategoriList]);

  // Drop `dragKategoriId` at the position of `targetId`
  const handleKategoriDrop = useCallback((targetId: number) => {
    setDragOverKategoriId(null);
    const sourceId = dragKategoriId;
    setDragKategoriId(null);
    if (sourceId == null || sourceId === targetId) return;
    const list = [...kategoriList];
    const from = list.findIndex(k => k.id === sourceId);
    const to = list.findIndex(k => k.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    persistKategoriOrder(list);
  }, [dragKategoriId, kategoriList, persistKategoriOrder]);

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
      if (me) setUser({ id: me.id, nama: me.nama, role: me.role });

      if (isNotificationSound(me?.alertSound)) {
        setAlertSound(me.alertSound);
        localStorage.setItem(ALERT_SOUND_STORAGE_KEY, me.alertSound);
      } else {
        // One-time migration for existing installations that only stored this
        // preference in the browser before the database field was introduced.
        const cachedSound = localStorage.getItem(ALERT_SOUND_STORAGE_KEY);
        if (isNotificationSound(cachedSound)) {
          setAlertSound(cachedSound);
          api.patch('/auth/profile', { alertSound: cachedSound }).catch(() => {});
        }
      }

      if (me?.wilayahAssignments) {
        const stationNames: string[] = [];
        for (const wa of me.wilayahAssignments) {
          try { stationNames.push(...JSON.parse(wa.wilayah.stations)); } catch {}
        }
        setUserStations(stationNames);
      }
    }).catch(() => {});
    void fetchKategori();
  }, [fetchKategori]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleLogout = () => { setUser(null); localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

  // Account management handlers (admin only)
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setManagedPetugasSearch('');
    setUserForm({ nipp: '', nama: '', password: '', role: 'ppj', wilayahIds: [], petugasIds: [] });
    setShowUserModal(true);
  };
  const handleOpenEditUser = (u: ManagedUser) => {
    setEditingUser(u);
    setManagedPetugasSearch('');
    setUserForm({
      nipp: u.nipp, nama: u.nama, password: '', role: u.role,
      wilayahIds: u.wilayahAssignments.map(wa => wa.wilayah.id),
      petugasIds: u.role === 'kupt'
        ? managedUsers.filter(candidate => candidate.role === 'ppj' && candidate.managerId === u.id).map(candidate => candidate.id)
        : [],
    });
    setShowUserModal(true);
  };
  const handleSaveUser = async () => {
    if (!userForm.nipp || !userForm.nama || !userForm.role) { showToast('Lengkapi semua field!', 'warning'); return; }
    if (!editingUser && !userForm.password) { showToast('Password wajib diisi untuk akun baru!', 'warning'); return; }
    if (userForm.role === 'kupt' && userForm.wilayahIds.length < 2) { showToast('Akun KUPT wajib memilih minimal 2 wilayah!', 'warning'); return; }
    try {
      setSavingUser(true);
      if (editingUser) {
        await api.patch(`/admin/users/${editingUser.id}`, {
          nama: userForm.nama, role: userForm.role, wilayahIds: userForm.wilayahIds, petugasIds: userForm.petugasIds,
          ...(userForm.password ? { password: userForm.password } : {}),
        });
      } else {
        await api.post('/admin/users', userForm);
      }
      setShowUserModal(false);
      fetchUsers();
    } catch (e: unknown) { showToast(getApiErrorMessage(e, 'Gagal menyimpan akun.'), 'error'); }
    finally { setSavingUser(false); }
  };
  const handleToggleUserActive = async (u: ManagedUser) => {
    if (busyUserId !== null) return;
    const action = u.isActive ? 'Nonaktifkan' : 'Aktifkan';
    if (!(await showConfirm(`${action} akun ${u.nama}?`))) return;
    try {
      setBusyUserId(u.id);
      await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive });
      showToast(`Akun berhasil ${u.isActive ? 'dinonaktifkan' : 'diaktifkan'}.`, 'success');
      await Promise.all([fetchUsers(), fetchAll()]);
    } catch (e: unknown) { showToast(getApiErrorMessage(e, 'Gagal mengubah status akun.'), 'error'); }
    finally { setBusyUserId(null); }
  };

  const handleDeleteUser = async (u: ManagedUser) => {
    if (busyUserId !== null) return;
    if (!(await showConfirm(`Hapus permanen akun ${u.nama} (${u.nipp})? Seluruh penugasan, riwayat inspeksi, laporan, foto, warning, dan data milik akun ini ikut terhapus. Petugas yang dikelolanya akan dilepas dari pengelolaan. Tindakan ini tidak dapat dibatalkan.`))) return;
    try {
      setBusyUserId(u.id);
      await api.delete(`/admin/users/${u.id}`, { data: { confirmPermanent: true } });
      setManagedUsers(current => current.filter(item => item.id !== u.id));
      showToast('Akun berhasil dihapus permanen.', 'success');
      await Promise.all([fetchUsers(), fetchAll()]);
    } catch (e: unknown) { showToast(getApiErrorMessage(e, 'Gagal menghapus akun.'), 'error'); }
    finally { setBusyUserId(null); }
  };

  const fetchTaskMapLocations = async () => {
    if (!isAdmin) return;
    try {
      setLoadingTaskLocations(true);
      const response = await api.get('/admin/map-locations');
      setRegisteredMapLocations(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Gagal mengambil titik MAP untuk penugasan.'), 'error');
    } finally {
      setLoadingTaskLocations(false);
    }
  };

  const handleOpenTaskModal = () => {
    setShowTaskModal(true);
    if (isAdmin) void fetchTaskMapLocations();
  };

  const findInspectionPoint = (selection: string) => {
    if (selection.startsWith('map:')) {
      const id = Number(selection.slice(4));
      const location = registeredMapLocations.find(item => item.id === id);
      return location ? { name: location.name, lat: location.latitude, lng: location.longitude, mapLocationId: String(location.id) } : null;
    }
    if (selection.startsWith('station:')) {
      const station = STATIONS.find(item => item.name === selection.slice(8));
      return station ? { name: station.name, lat: station.lat, lng: station.lng, mapLocationId: '' } : null;
    }
    return null;
  };

  // Station and registered MAP point dropdown handlers
  const handleStartPointChange = (selection: string) => {
    const point = findInspectionPoint(selection);
    if (point) {
      setForm(f => {
        const newForm = {
          ...f,
          startPointName: point.name,
          startPointLat: point.lat.toFixed(6),
          startPointLong: point.lng.toFixed(6),
          startMapLocationId: point.mapLocationId,
        };
        if (newForm.endPointName) {
          newForm.jalur = `${point.name} → ${newForm.endPointName}`;
        }
        return newForm;
      });
    } else {
      setForm(f => ({ ...f, startPointName: '', startPointLat: '', startPointLong: '', startMapLocationId: '' }));
    }
  };

  const handleEndPointChange = (selection: string) => {
    const point = findInspectionPoint(selection);
    if (point) {
      setForm(f => {
        const newForm = {
          ...f,
          endPointName: point.name,
          endPointLat: point.lat.toFixed(6),
          endPointLong: point.lng.toFixed(6),
          endMapLocationId: point.mapLocationId,
        };
        if (newForm.startPointName) {
          newForm.jalur = `${newForm.startPointName} → ${point.name}`;
        }
        return newForm;
      });
    } else {
      setForm(f => ({ ...f, endPointName: '', endPointLat: '', endPointLong: '', endMapLocationId: '' }));
    }
  };



  const handleCreateTugas = async () => {
    if (!form.jalur || !form.tanggal || !form.assignedTo || !form.startPointLat || !form.endPointLat) { showToast('Lengkapi semua field!', 'warning'); return; }
    try {
      setSubmitting(true);
      await api.post('/admin/tugas', form);
      setShowTaskModal(false);
      setForm({ jalur: '', tanggal: '', assignedTo: '', startPointName: '', endPointName: '', startPointLat: '', startPointLong: '', endPointLat: '', endPointLong: '', startMapLocationId: '', endMapLocationId: '', jamMulai: '', jamSelesai: '' });
      showToast('Penugasan berhasil ditambahkan.', 'success');
      fetchAll();
    } catch (e: unknown) { console.error(e); showToast(getApiErrorMessage(e, 'Gagal membuat tugas.'), 'error'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteTugas = async (id: number) => {
    if (!(await showConfirm('Hapus tugas ini?'))) return;
    try {
      await api.delete(`/admin/tugas/${id}`);
      showToast('Penugasan berhasil dihapus.', 'success');
      fetchAll();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal menghapus penugasan.'), 'error');
    }
  };

  const handleAddPetugas = async () => {
    if (selectedNipps.length === 0) return;
    try {
      setAddingPetugas(true);
      const res = await api.post('/admin/petugas/add', { nipps: selectedNipps });
      showToast(res.data.message, 'success');
      setShowAddPetugasModal(false);
      setSelectedNipps([]);
      fetchAll();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal menambahkan petugas.'), 'error');
    } finally {
      setAddingPetugas(false);
    }
  };

  const handleRemovePetugas = async (id: number) => {
    if (!(await showConfirm('Hapus petugas ini dari daftar kelola Anda? Mereka tidak akan dihapus dari sistem, hanya dari pantauan Anda.'))) return;
    try {
      await api.post('/admin/petugas/remove', { id });
      fetchAll();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal menghapus petugas.'), 'error');
    }
  };

  // Excel import/export handlers
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/admin/tugas/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'template_penugasan_ppj.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal mengunduh template.'), 'error');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      setImportLoading(true);
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showToast('Gunakan file .xlsx dari template terbaru.', 'warning');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/admin/tugas/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data.data);
      fetchAll(); // Refresh task list
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal mengimpor file.'), 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTugasPdf = async (tugasId: number) => {
    try {
      setDownloadingTugasId(tugasId);
      const res = await api.get(`/tugas/${tugasId}/report`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Laporan_Inspeksi_PPJ_${tugasId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal mengunduh laporan PDF.'), 'error');
    } finally {
      setDownloadingTugasId(null);
    }
  };

  const handleApproveTracking = async (safetyStatus: 'aman' | 'tidak_aman') => {
    detailRequest.current++;
    const trackingId = selectedTugasDetail?.tracking?.[0]?.id;
    if (!trackingId) return;
    const safetyLabel = safetyStatus === 'aman' ? 'Aman' : 'Tidak Aman';
    if (!(await showConfirm(`Approve hasil tracking dengan status ${safetyLabel}?`))) return;
    try {
      setApprovingTrackingId(trackingId);
      const res = await api.post(`/admin/tracking/${trackingId}/approve`, { safetyStatus });
      setSelectedTugasDetail(previous => previous ? {
        ...previous,
        status: res.data.tugasStatus ?? 'completed',
        tracking: previous.tracking?.map((tracking, index) => index === 0 ? { ...tracking, ...res.data.data } : tracking),
      } : previous);
      showToast('Hasil tracking berhasil di-approve.', 'success');
      await fetchAll();
    } catch (e: unknown) {
      showToast(getApiErrorMessage(e, 'Gagal menyetujui hasil tracking.'), 'error');
    } finally {
      setApprovingTrackingId(null);
    }
  };

  const mapEmergencies = React.useMemo(() => emergencies.map(e => ({ id: e.id, latitude: e.latitude, longitude: e.longitude, jenisTemuan: e.jenisTemuan, deskripsi: e.deskripsi, foto: e.foto, createdAt: e.createdAt, petugasNama: e.tracking?.tugas?.user?.nama, jalur: e.tracking?.tugas?.jalur })), [emergencies]);
  const mapTasks = React.useMemo(() => tugas
    .filter(t => t.status === 'in_progress')
    .map(t => ({ id: t.id, jalur: t.jalur, startPointLat: t.startPointLat, startPointLong: t.startPointLong, endPointLat: t.endPointLat, endPointLong: t.endPointLong, startPointName: t.startPointName, endPointName: t.endPointName, status: t.status, petugasNama: t.user?.nama, petugasNipp: t.user?.nipp })), [tugas]);

  const handleMapEmergencyClick = useCallback((em: {id: number}) => { setSelectedEmergency(emergencies.find(e => e.id === em.id) || null); }, [emergencies]);

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans overflow-hidden">
      {/* ── ALARM ACTIVE OVERLAY BANNER ──────────────────── */}
      {isAlarmActive && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ animation: 'alarmPulse 1s ease-in-out infinite' }}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 flex flex-col items-center gap-6 max-w-md mx-4 border-4 border-rose-500" style={{ animation: 'alarmBounce 0.5s ease-in-out infinite alternate' }}>
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-rose-100 flex items-center justify-center" style={{ animation: 'alarmIconPulse 0.8s ease-in-out infinite' }}>
              <span className="material-symbols-outlined text-rose-600 text-[48px] md:text-[56px]">crisis_alert</span>
            </div>
            <div className="text-center">
              <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 mb-2">🚨 ALARM DARURAT</h2>
              <p className="text-slate-500 text-sm md:text-base font-medium">Ada laporan darurat baru masuk!<br/>Segera periksa tab Insiden.</p>
            </div>
            <button
              onClick={handleStopAlarm}
              className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-lg font-extrabold flex items-center justify-center gap-3 shadow-lg shadow-rose-600/30 transition-all active:scale-95 uppercase tracking-wider"
            >
              <span className="material-symbols-outlined text-[28px]">alarm_off</span>
              Matikan Alarm
            </button>
          </div>
          <style>{`
            @keyframes alarmPulse {
              0%, 100% { background-color: rgba(0,0,0,0.6); }
              50% { background-color: rgba(190,18,60,0.35); }
            }
            @keyframes alarmBounce {
              0% { transform: scale(1); }
              100% { transform: scale(1.02); }
            }
            @keyframes alarmIconPulse {
              0%, 100% { transform: scale(1); background-color: rgb(255 228 230); }
              50% { transform: scale(1.15); background-color: rgb(254 205 211); }
            }
          `}</style>
        </div>
      )}

      {/* Premium Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-2 md:gap-4">
          <img src="/logo-kai.png" alt="KAI Logo" className="h-6 md:h-8 w-auto object-contain" />
          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="font-h3 text-base md:text-lg font-extrabold text-slate-800 tracking-tight hidden sm:block">Command Center <span className="text-primary">PPJ</span></h1>
          <span className={`ml-0 md:ml-2 px-2 py-0.5 text-white font-label-sm text-[10px] rounded uppercase font-bold tracking-widest shadow-sm hidden sm:inline-block ${ROLE_BADGE[userRole]?.bg || 'bg-slate-800'}`}>{ROLE_BADGE[userRole]?.label || 'Portal Admin'}</span>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          {/* Sound indicator + Stop Alarm */}
          <div className="flex items-center gap-1 md:gap-2 mr-1 md:mr-2">
            <button
              onClick={() => setActiveMenu('settings')}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-[11px] font-semibold ${alertSound === 'off' ? 'text-slate-400 hover:bg-slate-100' : 'text-emerald-600 hover:bg-emerald-50'}`}
              title={`Sirine: ${alertSound === 'off' ? 'Mati' : alertSound}`}
            >
              <span className="material-symbols-outlined text-[18px] md:text-[20px]">{alertSound === 'off' ? 'notifications_off' : 'notifications_active'}</span>
              <span className="hidden md:inline capitalize">{alertSound === 'off' ? 'Mati' : alertSound}</span>
            </button>
            {isAlarmActive && (
              <button
                onClick={handleStopAlarm}
                className="ml-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] md:text-[11px] font-bold rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95"
                style={{ animation: 'headerAlarmPulse 1s ease-in-out infinite' }}
              >
                <span className="material-symbols-outlined text-[16px]">alarm_off</span>
                <span className="hidden md:inline">Stop Alarm</span>
              </button>
            )}
            <style>{`
              @keyframes headerAlarmPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.4); }
                50% { box-shadow: 0 0 0 6px rgba(225, 29, 72, 0); }
              }
            `}</style>
          </div>
          <div className="w-px h-6 bg-slate-200 hidden md:block"></div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-primary-container text-primary rounded-full flex items-center justify-center font-bold text-xs md:text-sm border border-primary/20">
              {user?.nama?.substring(0, 2).toUpperCase() || 'AD'}
            </div>
            <div className="hidden md:flex flex-col">
              <span className="font-body-md text-sm font-bold text-slate-700 leading-none">{user?.nama}</span>
            </div>
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          <button disabled={refreshingDashboard} onClick={() => void fetchAll()} title="Segarkan tugas dan laporan" className="text-xs font-semibold text-slate-500 disabled:opacity-50">{refreshingDashboard ? 'Memuat…' : 'Segarkan'}</button>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-error transition-colors font-label-sm font-semibold p-1">
            <span className="material-symbols-outlined text-[20px] md:text-[20px]">logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-col-reverse md:flex-row flex-1 overflow-hidden relative pb-[60px] md:pb-0">

        {/* Bottom / Vertical Sidebar Nav */}
        <nav className="fixed md:static bottom-0 left-0 right-0 h-[60px] md:h-auto md:w-[72px] bg-white border-t md:border-t-0 md:border-r border-slate-200 flex flex-row md:flex-col items-center justify-start py-2 md:py-4 px-1 md:px-0 gap-2 shrink-0 z-40 overflow-x-auto md:overflow-visible">
          <button
            onClick={() => setActiveMenu('penugasan')}
            className={`w-16 h-12 md:w-14 md:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
              activeMenu === 'penugasan'
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Penugasan PPJ"
          >
            <span className="material-symbols-outlined text-[20px] md:text-[22px]">assignment</span>
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Tugas</span>
          </button>
          <button
            onClick={() => setActiveMenu('liveview')}
            className={`w-16 h-12 md:w-14 md:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
              activeMenu === 'liveview'
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Live View"
          >
            <span className="material-symbols-outlined text-[20px] md:text-[22px]">map</span>
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Live</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveMenu('locationmap')}
              className={`w-16 h-12 md:w-14 md:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                activeMenu === 'locationmap'
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title="Kelola Titik Lokasi"
            >
              <span className="material-symbols-outlined text-[20px] md:text-[22px]">add_location_alt</span>
              <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Map</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setActiveMenu('akun'); fetchUsers(); }}
              className={`w-16 h-12 md:w-14 md:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                activeMenu === 'akun'
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title="Kelola Akun"
            >
              <span className="material-symbols-outlined text-[20px] md:text-[22px]">manage_accounts</span>
              <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Akun</span>
            </button>
          )}
          <button
            onClick={() => { setActiveMenu('settings'); fetchKategori(); }}
            className={`w-16 h-12 md:w-14 md:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
              activeMenu === 'settings'
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Pengaturan"
          >
            <span className="material-symbols-outlined text-[20px] md:text-[22px]">settings</span>
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">Setting</span>
          </button>
        </nav>

        {/* ── PENUGASAN VIEW ──────────────────────────────────── */}
        {activeMenu === 'penugasan' && (
          <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden p-3 md:p-4 gap-4">
            {/* Left Sidebar (Stats + Lists) */}
            <aside className="w-full md:w-[420px] flex flex-col gap-4 shrink-0">
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
              <div className="min-h-[400px] md:min-h-0 flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
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
                        <div key={t.id} onClick={() => void openTugasDetail(t)} className="bg-slate-50 rounded-xl p-4 border border-slate-200 cursor-pointer hover:border-primary/40 hover:bg-blue-50/30 transition-all group" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') void openTugasDetail(t); }}>
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <p className="font-bold text-slate-800 text-sm leading-snug group-hover:text-primary transition-colors">{t.jalur}</p>
                            {canWrite && (
                              <button onClick={e => { e.stopPropagation(); handleDeleteTugas(t.id); }} className="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded hover:bg-rose-100 shrink-0">
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
                      {/* Emergency List */}
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
                    {/* Excel Import/Export Row */}
                    <div className="w-full space-y-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importLoading}
                        className="w-full py-2 bg-white border border-blue-300 text-blue-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-blue-50 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">{importLoading ? 'hourglass_empty' : 'upload_file'}</span>
                        {importLoading ? 'Importing...' : 'Import Excel'}
                      </button>
                      <button
                        onClick={handleDownloadTemplate}
                        className="w-full py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 shadow-sm transition-all active:scale-[0.98]"
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                        Download Template
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx"
                        onChange={handleImportExcel}
                        className="hidden"
                      />
                    </div>
                    {/* Create Single Task Button */}
                    <button onClick={handleOpenTaskModal} className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]">
                      <span className="material-symbols-outlined text-[18px]">add</span> Tugaskan Pemeriksa
                    </button>
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
            <main className="min-h-[500px] md:min-h-0 flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
              {/* Penugasan summary with large cards */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <h2 className="text-lg font-extrabold text-slate-800 mb-1 tracking-tight">Daftar Penugasan PPJ</h2>
                <p className="text-sm text-slate-500 mb-4">Kelola tugas inspeksi jalur petugas Anda</p>

                {/* Filter bar */}
                {tugas.length > 0 && (
                  <div className="space-y-3 mb-6">
                    <div className="flex flex-col gap-3">
                      <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                        <input
                          value={tugasSearchQuery}
                          onChange={e => setTugasSearchQuery(e.target.value)}
                          placeholder="Cari jalur, nama, atau NIPP petugas..."
                          className="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-800 bg-white focus:ring-2 focus:ring-primary focus:border-primary outline-none font-medium"
                        />
                        {tugasSearchQuery && (
                          <button
                            onClick={() => setTugasSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            title="Bersihkan pencarian"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 bg-slate-100 rounded-xl p-1.5" role="group" aria-label="Filter status penugasan">
                        {TUGAS_STATUS_FILTERS.map(({ value, label, icon }) => (
                          <button
                            key={value}
                            onClick={() => setTugasStatusFilter(value)}
                            aria-pressed={tugasStatusFilter === value}
                            className={`min-w-0 px-2.5 py-2 rounded-lg border text-[11px] font-bold transition-all ${
                              tugasStatusFilter === value
                                ? STATUS_FILTER_ACTIVE[value]
                                : 'bg-transparent text-slate-600 border-transparent hover:bg-white hover:border-slate-200'
                            }`}
                          >
                            <span className="flex items-center justify-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px] shrink-0">{icon}</span>
                              <span className="truncate">{label}</span>
                              <span className={`min-w-5 h-5 px-1 rounded-full inline-flex items-center justify-center text-[10px] tabular-nums ${
                                tugasStatusFilter === value ? 'bg-white/25' : 'bg-white text-slate-500'
                              }`}>{tugasStatusCounts[value]}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2 text-slate-600 sm:mr-1">
                        <span className="material-symbols-outlined text-[19px]">date_range</span>
                        <span className="text-xs font-bold uppercase tracking-wider">Rentang Tanggal</span>
                      </div>
                      <label className="flex-1 min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Dari</span>
                        <input type="date" value={tugasDateFrom} max={tugasDateTo || undefined} onChange={e => setTugasDateFrom(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-primary outline-none" />
                      </label>
                      <label className="flex-1 min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Sampai</span>
                        <input type="date" value={tugasDateTo} min={tugasDateFrom || undefined} onChange={e => setTugasDateTo(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 bg-white focus:ring-2 focus:ring-primary outline-none" />
                      </label>
                      {(tugasDateFrom || tugasDateTo) && (
                        <button
                          onClick={() => { setTugasDateFrom(''); setTugasDateTo(''); }}
                          className="h-[34px] px-3 rounded-lg text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          Hapus tanggal
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500">Menampilkan {filteredTugas.length} dari {tugas.length} tugas</p>
                  </div>
                )}

                {tugas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">assignment</span>
                    <p className="text-slate-500 font-medium">Belum ada tugas yang dibuat.</p>
                    <p className="text-slate-400 text-sm mt-1">Gunakan panel di sebelah kiri untuk membuat penugasan baru.</p>
                  </div>
                ) : filteredTugas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-slate-200 text-6xl mb-4">search_off</span>
                    <p className="text-slate-500 font-medium">Tidak ada tugas yang cocok dengan filter.</p>
                    <button
                      onClick={() => { setTugasSearchQuery(''); setTugasStatusFilter('all'); setTugasDateFrom(''); setTugasDateTo(''); }}
                      className="text-primary text-sm font-semibold mt-2 hover:underline"
                    >
                      Reset filter
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredTugas.map(t => {
                      const latestTracking = t.tracking?.[0];
                      const laporanCount = latestTracking?.laporan?.length ?? 0;
                      return (
                        <button key={t.id} type="button" onClick={() => void openTugasDetail(t)} className={`w-full text-left rounded-2xl border p-5 hover:shadow-md transition-all group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40 ${t.status === 'need_approval' ? 'bg-amber-50 border-amber-300 hover:border-amber-400' : 'bg-slate-50 border-slate-200 hover:border-primary/50'}`}>
                          <div className={`absolute top-0 left-0 w-1.5 h-full ${t.status === 'completed' ? 'bg-emerald-500' : t.status === 'need_approval' ? 'bg-amber-400' : t.status === 'in_progress' ? 'bg-primary' : 'bg-slate-300'}`}></div>
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
                            <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-bold text-primary opacity-70 group-hover:opacity-100">
                              Lihat detail <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </div>
                          </div>
                        </button>
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
          <main className="flex-1 overflow-hidden flex flex-col relative isolate m-3 md:m-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <AdminMap
              emergencies={mapEmergencies}
              tasks={mapTasks}
              livePositions={livePositions} monitoringError={liveError}
              onEmergencyClick={handleMapEmergencyClick}
            />

            {/* Legend */}
            <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-md border border-slate-200 z-[1000]">
              <p className="text-slate-500 uppercase font-bold text-[9px] tracking-widest mb-2">Legenda Visual</p>
              <div className="flex flex-col gap-2">
                {[['#005bac','Rute Tugas Aktif']].map(([c,l]) => (
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

        {/* ── LOCATION MAP (Admin Only) ───────────────────── */}
        {activeMenu === 'locationmap' && isAdmin && (
          <main className="flex-1 overflow-hidden relative isolate m-3 md:m-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <AdminLocationMap />
          </main>
        )}

        {/* ── AKUN MANAGEMENT VIEW (Admin Only) ────────────── */}
        {activeMenu === 'akun' && isAdmin && <AdminAccounts userSearchQuery={userSearchQuery} setUserSearchQuery={setUserSearchQuery} handleOpenCreateUser={handleOpenCreateUser} managedUsers={managedUsers} ROLE_LABEL={ROLE_LABEL} busyUserId={busyUserId} handleOpenEditUser={handleOpenEditUser} handleToggleUserActive={handleToggleUserActive} handleDeleteUser={handleDeleteUser} />}

        {/* ── SETTINGS VIEW ──────────────────────────────────── */}
        {activeMenu === 'settings' && <AdminSettings isAdmin={isAdmin} handleAlertSoundChange={handleAlertSoundChange} savingAlertSound={savingAlertSound} alertSound={alertSound} canWrite={canWrite} setEditingKategori={setEditingKategori} setKategoriForm={setKategoriForm} setShowKategoriModal={setShowKategoriModal} kategoriList={kategoriList} reorderingKategori={reorderingKategori} setDragKategoriId={setDragKategoriId} setDragOverKategoriId={setDragOverKategoriId} dragKategoriId={dragKategoriId} handleKategoriDrop={handleKategoriDrop} dragOverKategoriId={dragOverKategoriId} fetchKategori={fetchKategori} user={user} ROLE_LABEL={ROLE_LABEL} userRole={userRole} stats={stats} />}

      </div>

      {/* Create/Edit User Modal (Admin Only) */}
      {showUserModal && isAdmin && <UserEditor editingUser={editingUser} setShowUserModal={setShowUserModal} userForm={userForm} setUserForm={setUserForm} allWilayah={allWilayah} managedPetugasSearch={managedPetugasSearch} setManagedPetugasSearch={setManagedPetugasSearch} managedUsers={managedUsers} handleSaveUser={handleSaveUser} savingUser={savingUser} />}




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
      {showTaskModal && <AssignmentEditor setShowTaskModal={setShowTaskModal} form={form} setForm={setForm} petugas={petugas} handleStartPointChange={handleStartPointChange} filteredStations={filteredStations} isAdmin={isAdmin} registeredMapLocations={registeredMapLocations} handleEndPointChange={handleEndPointChange} haversineKm={haversineKm} loadingTaskLocations={loadingTaskLocations} handleCreateTugas={handleCreateTugas} submitting={submitting} />}

      {/* Add Petugas Modal */}
      {showAddPetugasModal && <PetugasPicker setShowAddPetugasModal={setShowAddPetugasModal} searchPetugas={searchPetugas} setSearchPetugas={setSearchPetugas} availablePetugas={availablePetugas} selectedNipps={selectedNipps} setSelectedNipps={setSelectedNipps} handleAddPetugas={handleAddPetugas} addingPetugas={addingPetugas} />}

      {/* Riwayat Pekerjaan Modal */}
      {selectedPetugasHistory && <PetugasHistory selectedPetugasHistory={selectedPetugasHistory} setSelectedPetugasHistory={setSelectedPetugasHistory} tugas={petugasHistoryTasks} STATUS_COLOR={STATUS_COLOR} STATUS_LABEL={STATUS_LABEL} haversineKm={haversineKm} JENIS_COLOR={JENIS_COLOR} JENIS_LABEL={JENIS_LABEL} />}

      {/* ── Task Detail Modal ───────────────────────────── */}
      {selectedTugasDetail && (
        <TaskDetailModal
          tugas={selectedTugasDetail}
          jenisLabel={JENIS_LABEL}
          jenisColor={JENIS_COLOR}
          isDownloading={downloadingTugasId === selectedTugasDetail.id}
          isAdmin={isAdmin}
          isApproving={approvingTrackingId === selectedTugasDetail.tracking?.[0]?.id}
          onDownloadPdf={() => handleDownloadTugasPdf(selectedTugasDetail.id)}
          onApprove={handleApproveTracking}
          onClose={() => setSelectedTugasDetail(null)}
        />
      )}

      {/* ── Import Result Modal ──────────────────────────── */}
      {importResult && <ImportResult setImportResult={setImportResult} importResult={importResult} />}

      {/* ═══ KATEGORI TEMUAN MODAL ═══ */}
      {showKategoriModal && <CategoryEditor editingKategori={editingKategori} setShowKategoriModal={setShowKategoriModal} kategoriForm={kategoriForm} setKategoriForm={setKategoriForm} ICON_OPTIONS={ICON_OPTIONS} savingKategori={savingKategori} setSavingKategori={setSavingKategori} fetchKategori={fetchKategori} />}

    </div>
  );
}
