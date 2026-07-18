'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../lib/api';
import { showToast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { getApiErrorMessage } from '../../lib/utils';
import { STATIONS, type StationPoint } from '../../lib/stations';

interface SavedLocation {
  id: number;
  name: string;
  address: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  createdAt?: string;
}

interface SearchResult {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  type: string;
}

interface DraftLocation {
  latitude: number;
  longitude: number;
  address: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

function savedLocationIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:34px;height:34px;background:#005bac;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:white;font-size:17px">●</span></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function stationIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:34px;height:34px;background:#0f766e;border:3px solid white;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span class="material-symbols-outlined" style="color:white;font-size:19px;font-variation-settings:\'FILL\' 1">train</span></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function draftLocationIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center"><div style="position:absolute;width:42px;height:42px;background:rgba(245,158,11,.25);border-radius:50%;animation:draftPulse 1.6s infinite"></div><div style="width:22px;height:22px;background:#f59e0b;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div></div><style>@keyframes draftPulse{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.4);opacity:0}}</style>',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

export default function AdminLocationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);
  const savedLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [selectedStation, setSelectedStation] = useState<StationPoint | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation | null>(null);
  const [draft, setDraft] = useState<DraftLocation | null>(null);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationLoadError, setLocationLoadError] = useState('');

  const updateDraftCoordinates = useCallback((latitude: number, longitude: number, address = '') => {
    setDraft({ latitude, longitude, address });
    setManualLatitude(latitude.toFixed(6));
    setManualLongitude(longitude.toFixed(6));
  }, []);

  const getManualCoordinates = () => {
    if (!manualLatitude.trim() || !manualLongitude.trim()) {
      showToast('Latitude dan longitude wajib diisi.', 'warning');
      return null;
    }
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      showToast('Latitude harus berupa angka antara -90 sampai 90.', 'warning');
      return null;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      showToast('Longitude harus berupa angka antara -180 sampai 180.', 'warning');
      return null;
    }
    return { latitude, longitude };
  };

  const fetchLocations = useCallback(async () => {
    try {
      setLoadingLocations(true);
      setLocationLoadError('');
      const response = await api.get('/admin/map-locations');
      setLocations(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Gagal memuat titik lokasi.');
      setLocationLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([-7.6, 110.4], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    stationLayerRef.current = L.layerGroup().addTo(map);
    savedLayerRef.current = L.layerGroup().addTo(map);
    draftLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', event => {
      setSelectedStation(null);
      setSelectedLocation(null);
      setSearchResults([]);
      updateDraftCoordinates(event.latlng.lat, event.latlng.lng);
      setName('');
      setDescription('');
    });
    mapRef.current = map;
    setMapReady(true);
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [updateDraftCoordinates]);

  useEffect(() => {
    if (!mapReady || !stationLayerRef.current) return;
    stationLayerRef.current.clearLayers();
    STATIONS.forEach(station => {
      L.marker([station.lat, station.lng], { icon: stationIcon(), zIndexOffset: 100 })
        .bindTooltip(`<b>${escapeHtml(station.name)}</b><br><span style="font-size:10px;color:#64748b">Stasiun · Titik pengecekan</span>`)
        .on('click', () => {
          setDraft(null);
          setSelectedLocation(null);
          setSearchResults([]);
          setSelectedStation(station);
        })
        .addTo(stationLayerRef.current!);
    });
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !savedLayerRef.current) return;
    savedLayerRef.current.clearLayers();
    locations.forEach(location => {
      const marker = L.marker([location.latitude, location.longitude], { icon: savedLocationIcon() })
        .bindTooltip(`<b>${escapeHtml(location.name)}</b>${location.address ? `<br><span style="font-size:10px;color:#64748b">${escapeHtml(location.address)}</span>` : ''}`)
        .on('click', () => {
          setDraft(null);
          setSelectedStation(null);
          setSearchResults([]);
          setSelectedLocation(location);
        });
      marker.addTo(savedLayerRef.current!);
    });
  }, [locations, mapReady]);

  useEffect(() => {
    if (!mapReady || !draftLayerRef.current) return;
    draftLayerRef.current.clearLayers();
    if (draft) {
      L.marker([draft.latitude, draft.longitude], {
        icon: draftLocationIcon(),
        zIndexOffset: 1000,
        draggable: true,
      })
        .on('dragend', event => {
          const position = (event.target as L.Marker).getLatLng();
          updateDraftCoordinates(position.lat, position.lng, draft.address);
        })
        .addTo(draftLayerRef.current);
    }
  }, [draft, mapReady, updateDraftCoordinates]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3) {
      showToast('Masukkan minimal 3 karakter pencarian.', 'warning');
      return;
    }
    try {
      setSearching(true);
      setSelectedStation(null);
      setSelectedLocation(null);
      const response = await api.get('/admin/map-search', { params: { q: query.trim() } });
      setSearchResults(response.data.data);
      if (response.data.data.length === 0) showToast('Lokasi tidak ditemukan.', 'warning');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Pencarian lokasi gagal.'), 'error');
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = (result: SearchResult) => {
    setSelectedStation(null);
    setSelectedLocation(null);
    setSearchResults([]);
    updateDraftCoordinates(result.latitude, result.longitude, result.displayName);
    setName(result.name);
    setDescription('');
    mapRef.current?.flyTo([result.latitude, result.longitude], 16, { duration: 0.8 });
  };

  const beginManualEntry = () => {
    const center = mapRef.current?.getCenter() || L.latLng(-7.6, 110.4);
    setSelectedStation(null);
    setSelectedLocation(null);
    setSearchResults([]);
    updateDraftCoordinates(center.lat, center.lng);
    setName('');
    setDescription('');
  };

  const applyManualCoordinates = () => {
    const coordinates = getManualCoordinates();
    if (!coordinates) return;
    updateDraftCoordinates(coordinates.latitude, coordinates.longitude, draft?.address || '');
    const currentZoom = mapRef.current?.getZoom() || 10;
    mapRef.current?.flyTo([coordinates.latitude, coordinates.longitude], Math.max(currentZoom, 15), { duration: 0.6 });
    showToast('Koordinat berhasil diterapkan.', 'success');
  };

  const handleSave = async () => {
    if (!draft || !name.trim()) {
      showToast('Nama lokasi wajib diisi.', 'warning');
      return;
    }
    const coordinates = getManualCoordinates();
    if (!coordinates) return;
    try {
      setSaving(true);
      const response = await api.post('/admin/map-locations', {
        name: name.trim(),
        address: draft.address,
        description: description.trim(),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });
      setLocations(current => [response.data.data, ...current]);
      setDraft(null);
      setManualLatitude('');
      setManualLongitude('');
      setName('');
      setDescription('');
      showToast('Titik lokasi berhasil disimpan.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Gagal menyimpan titik lokasi.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (location: SavedLocation) => {
    if (!(await showConfirm(`Hapus titik lokasi "${location.name}"?`))) return;
    try {
      await api.delete(`/admin/map-locations/${location.id}`);
      setLocations(current => current.filter(item => item.id !== location.id));
      setSelectedLocation(current => current?.id === location.id ? null : current);
      showToast('Titik lokasi berhasil dihapus.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Gagal menghapus titik lokasi.'), 'error');
    }
  };

  const showAllLocations = () => {
    if (!mapRef.current) return;
    const allPoints: [number, number][] = [
      ...STATIONS.map(station => [station.lat, station.lng] as [number, number]),
      ...locations.map(location => [location.latitude, location.longitude] as [number, number]),
    ];
    const bounds = L.latLngBounds(allPoints);
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  };

  const focusLocation = (location: SavedLocation) => {
    setDraft(null);
    setSelectedStation(null);
    setSearchResults([]);
    setSelectedLocation(location);
    mapRef.current?.flyTo([location.latitude, location.longitude], 17, { duration: 0.7 });
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-100">
      <div className="relative flex-1 min-h-[260px] md:min-h-[360px]">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="absolute top-3 left-3 right-3 md:right-auto md:w-[420px] z-[1000]">
        <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-400 ml-2">search</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari stasiun, alamat, atau tempat..." className="min-w-0 flex-1 py-2 text-sm font-medium text-slate-800 outline-none" />
          {query && <button type="button" onClick={() => { setQuery(''); setSearchResults([]); }} className="text-slate-400 hover:text-slate-700"><span className="material-symbols-outlined text-[19px]">close</span></button>}
          <button type="submit" disabled={searching} className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm disabled:opacity-50">
            {searching ? 'Mencari...' : 'Cari'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className="mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[330px] overflow-y-auto">
            {searchResults.map(result => (
              <button key={result.id} type="button" onClick={() => selectSearchResult(result)} className="w-full text-left px-4 py-3 border-b last:border-b-0 border-slate-100 hover:bg-blue-50 transition-colors flex gap-3">
                <span className="material-symbols-outlined text-primary mt-0.5">location_on</span>
                <span className="min-w-0"><span className="block text-sm font-bold text-slate-800 truncate">{result.name}</span><span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{result.displayName}</span></span>
              </button>
            ))}
            <p className="px-4 py-2 text-[9px] text-slate-400 text-right">Pencarian © OpenStreetMap contributors</p>
          </div>
        )}
      </div>

      <div className="absolute top-[76px] md:top-3 right-3 z-[900] flex flex-wrap justify-end gap-2 max-w-[calc(100%-1.5rem)]">
        <button type="button" onClick={beginManualEntry} className="bg-primary text-white rounded-xl shadow-md px-3 py-2 text-xs font-bold hover:bg-primary/90 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px]">edit_location_alt</span>Input Koordinat
        </button>
        <div className="bg-white/95 backdrop-blur rounded-xl shadow-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 flex items-center gap-2">
          <span className="material-symbols-outlined text-teal-700 text-[18px]">train</span>{STATIONS.length} stasiun
        </div>
        <div className="bg-white/95 backdrop-blur rounded-xl shadow-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[18px]">pin_drop</span>{locations.length} titik MAP
        </div>
        <button type="button" onClick={showAllLocations} className="bg-white/95 rounded-xl shadow-md border border-slate-200 px-3 py-2 text-xs font-bold text-primary hover:bg-blue-50">Lihat Semua</button>
      </div>

      {!draft && !selectedLocation && !selectedStation && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[900] bg-slate-900/90 text-white rounded-full px-4 py-2.5 shadow-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap">
          <span className="material-symbols-outlined text-amber-400 text-[18px]">add_location_alt</span>Klik peta atau gunakan Input Koordinat
        </div>
      )}

      {draft && (
        <div className="absolute bottom-3 left-3 right-3 md:left-auto md:w-[380px] z-[1000] max-h-[calc(100%-6rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-y-auto">
          <div className="bg-slate-800 px-4 py-3 flex items-center justify-between"><p className="text-sm font-bold text-white flex items-center gap-2"><span className="material-symbols-outlined text-amber-400">add_location_alt</span>Tambah Titik Lokasi</p><button type="button" onClick={() => { setDraft(null); setManualLatitude(''); setManualLongitude(''); }} className="text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button></div>
          <div className="p-4 space-y-3">
            <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Nama Lokasi</label><input value={name} onChange={event => setName(event.target.value)} maxLength={150} placeholder="Contoh: Pos Jaga KM 123" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary" /></div>
            {draft.address && <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 line-clamp-2">{draft.address}</p>}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Koordinat Manual</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="any" value={manualLatitude} onChange={event => setManualLatitude(event.target.value)} placeholder="Latitude" aria-label="Latitude" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary" />
                <input type="number" step="any" value={manualLongitude} onChange={event => setManualLongitude(event.target.value)} placeholder="Longitude" aria-label="Longitude" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button type="button" onClick={applyManualCoordinates} className="w-full mt-2 py-2 border border-primary/30 text-primary hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2"><span className="material-symbols-outlined text-[17px]">my_location</span>Terapkan Koordinat</button>
              <p className="text-[10px] text-slate-400 mt-1.5">Marker dapat digeser langsung untuk menyesuaikan titik.</p>
            </div>
            <div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Catatan (Opsional)</label><textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} placeholder="Tambahkan keterangan titik..." className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" /></div>
            <button type="button" onClick={handleSave} disabled={saving || !name.trim()} className="w-full py-3 bg-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"><span className="material-symbols-outlined text-[19px]">save</span>{saving ? 'Menyimpan...' : 'Simpan Titik'}</button>
          </div>
        </div>
      )}

      {selectedLocation && (
        <div className="absolute bottom-3 left-3 right-3 md:left-auto md:w-[380px] z-[1000] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-base font-extrabold text-slate-800">{selectedLocation.name}</p>{selectedLocation.address && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{selectedLocation.address}</p>}</div><button type="button" onClick={() => setSelectedLocation(null)} className="text-slate-400"><span className="material-symbols-outlined">close</span></button></div>
            {selectedLocation.description && <p className="text-sm text-slate-700 mt-3 bg-slate-50 rounded-xl p-3">{selectedLocation.description}</p>}
            <p className="text-[10px] text-slate-400 font-mono mt-3">{selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}</p>
            <button type="button" onClick={() => handleDelete(selectedLocation)} className="w-full mt-3 py-2.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2"><span className="material-symbols-outlined text-[18px]">delete</span>Hapus Titik</button>
          </div>
        </div>
      )}

      {selectedStation && (
        <div className="absolute bottom-3 left-3 right-3 md:left-auto md:w-[380px] z-[1000] bg-white rounded-2xl shadow-2xl border border-teal-200 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-teal-700 text-white flex items-center justify-center shrink-0"><span className="material-symbols-outlined">train</span></div>
                <div className="min-w-0"><p className="text-[10px] uppercase tracking-widest font-bold text-teal-700">Stasiun · Titik Pengecekan</p><p className="text-base font-extrabold text-slate-800 mt-0.5">{selectedStation.name}</p></div>
              </div>
              <button type="button" onClick={() => setSelectedStation(null)} className="text-slate-400"><span className="material-symbols-outlined">close</span></button>
            </div>
            <p className="text-[11px] text-slate-500 font-mono mt-3 bg-slate-50 rounded-xl p-3">{selectedStation.lat.toFixed(6)}, {selectedStation.lng.toFixed(6)}</p>
            <p className="text-xs text-slate-500 mt-2">Stasiun ini tersedia sebagai titik awal atau akhir pada form penugasan.</p>
          </div>
        </div>
      )}
      </div>

      <section className="h-[260px] md:h-[280px] shrink-0 bg-white border-t border-slate-200 flex flex-col relative z-[1100]">
        <div className="px-4 md:px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">table_rows</span>
              Daftar Titik MAP Terdaftar
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{STATIONS.length} stasiun ditampilkan pada peta · {locations.length} titik MAP tersimpan</p>
          </div>
          <button type="button" onClick={fetchLocations} disabled={loadingLocations} className="shrink-0 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-primary hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[17px] ${loadingLocations ? 'animate-spin' : ''}`}>refresh</span>
            Muat Ulang
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loadingLocations ? (
            <div className="h-full flex items-center justify-center gap-2 text-sm text-slate-500">
              <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
              Mengambil titik lokasi...
            </div>
          ) : locationLoadError ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <span className="material-symbols-outlined text-rose-500 text-[30px]">cloud_off</span>
              <p className="text-sm font-bold text-slate-700 mt-1">Gagal mengambil titik lokasi</p>
              <p className="text-xs text-slate-500 mt-0.5 max-w-lg">{locationLoadError}</p>
              <button type="button" onClick={fetchLocations} className="mt-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold">Coba Lagi</button>
            </div>
          ) : locations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 text-slate-500">
              <span className="material-symbols-outlined text-slate-300 text-[34px]">location_off</span>
              <p className="text-sm font-bold mt-1">Belum ada titik terdaftar</p>
              <p className="text-xs mt-0.5">Klik peta atau gunakan Input Koordinat untuk menambahkan titik.</p>
            </div>
          ) : (
            <table className="w-full min-w-[820px] text-left">
              <thead className="sticky top-0 bg-slate-50 z-10 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-bold w-12">No.</th>
                  <th className="px-4 py-2.5 font-bold">Nama Lokasi</th>
                  <th className="px-4 py-2.5 font-bold">Alamat / Catatan</th>
                  <th className="px-4 py-2.5 font-bold">Koordinat</th>
                  <th className="px-4 py-2.5 font-bold">Terdaftar</th>
                  <th className="px-4 py-2.5 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locations.map((location, index) => (
                  <tr key={location.id} className={`text-xs hover:bg-blue-50/50 transition-colors ${selectedLocation?.id === location.id ? 'bg-blue-50' : 'bg-white'}`}>
                    <td className="px-4 py-3 text-slate-400 font-semibold">{index + 1}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => focusLocation(location)} className="font-bold text-slate-800 hover:text-primary text-left">{location.name}</button>
                    </td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <p className="text-slate-600 truncate">{location.address || '-'}</p>
                      {location.description && <p className="text-[10px] text-slate-400 truncate mt-0.5">{location.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{location.createdAt ? new Date(location.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => focusLocation(location)} className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-primary font-bold hover:bg-blue-100 flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">my_location</span>Lihat</button>
                        <button type="button" onClick={() => handleDelete(location)} className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">delete</span>Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
