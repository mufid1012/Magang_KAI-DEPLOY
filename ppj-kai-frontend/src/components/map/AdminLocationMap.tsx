'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../lib/api';
import { showToast } from '../../lib/toast';
import { showConfirm } from '../../lib/confirm';
import { getApiErrorMessage } from '../../lib/utils';

interface SavedLocation {
  id: number;
  name: string;
  address: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
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
  const savedLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
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
      const response = await api.get('/admin/map-locations');
      setLocations(response.data.data);
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Gagal memuat titik lokasi.'), 'error');
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
    savedLayerRef.current = L.layerGroup().addTo(map);
    draftLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', event => {
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
    if (!mapReady || !savedLayerRef.current) return;
    savedLayerRef.current.clearLayers();
    locations.forEach(location => {
      const marker = L.marker([location.latitude, location.longitude], { icon: savedLocationIcon() })
        .bindTooltip(`<b>${escapeHtml(location.name)}</b>${location.address ? `<br><span style="font-size:10px;color:#64748b">${escapeHtml(location.address)}</span>` : ''}`)
        .on('click', () => {
          setDraft(null);
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
    setSelectedLocation(null);
    setSearchResults([]);
    updateDraftCoordinates(result.latitude, result.longitude, result.displayName);
    setName(result.name);
    setDescription('');
    mapRef.current?.flyTo([result.latitude, result.longitude], 16, { duration: 0.8 });
  };

  const beginManualEntry = () => {
    const center = mapRef.current?.getCenter() || L.latLng(-7.6, 110.4);
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
      setSelectedLocation(null);
      showToast('Titik lokasi berhasil dihapus.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Gagal menghapus titik lokasi.'), 'error');
    }
  };

  const showAllLocations = () => {
    if (!mapRef.current || locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map(location => [location.latitude, location.longitude] as [number, number]));
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  };

  return (
    <div className="w-full h-full relative bg-slate-100">
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
          <span className="material-symbols-outlined text-primary text-[18px]">pin_drop</span>{locations.length} titik
        </div>
        {locations.length > 0 && <button type="button" onClick={showAllLocations} className="bg-white/95 rounded-xl shadow-md border border-slate-200 px-3 py-2 text-xs font-bold text-primary hover:bg-blue-50">Lihat Semua</button>}
      </div>

      {!draft && !selectedLocation && (
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
    </div>
  );
}
