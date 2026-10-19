'use client';
import { useCallback,useEffect,useState } from 'react';
import api from '../../lib/api';
import { showConfirm } from '../../lib/confirm';
import { LoginPhoto,loginPhotoUrl } from '../../lib/loginPhotos';
import { showToast } from '../../lib/toast';
import { getApiErrorMessage } from '../../lib/utils';

const emptyForm = { title: '', sortOrder: '0', isActive: true };
const sorted = (photos: LoginPhoto[]) => [...photos].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

export default function LoginPhotoSettings() {
  const [photos, setPhotos] = useState<LoginPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LoginPhoto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/login-photos');
      setPhotos(res.data.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Gagal memuat foto login'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchPhotos(); }, [fetchPhotos]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function openEditor(photo: LoginPhoto | null) {
    setEditing(photo);
    setForm(photo ? { title: photo.title, sortOrder: String(photo.sortOrder), isActive: photo.isActive } : {
      ...emptyForm, sortOrder: String(Math.min(9999, photos.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0))),
    });
    setFile(null);
    setFileError('');
    setEditorOpen(true);
  }

  async function savePhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || fileError) return;
    if (!editing && !file) { setFileError('Pilih foto yang akan diunggah'); return; }
    setBusy(true);
    try {
      const data = new FormData();
      data.append('title', form.title.trim());
      data.append('sortOrder', form.sortOrder);
      data.append('isActive', String(form.isActive));
      if (file) data.append('photo', file);
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      const res = editing
        ? await api.patch(`/admin/login-photos/${editing.id}`, data, config)
        : await api.post('/admin/login-photos', data, config);
      setPhotos(items => sorted([...items.filter(item => item.id !== res.data.data.id), res.data.data]));
      setEditorOpen(false);
      setFile(null);
      showToast(editing ? 'Foto login berhasil diperbarui' : 'Foto login berhasil ditambahkan', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Gagal menyimpan foto login'), 'error');
    } finally { setBusy(false); }
  }

  async function deletePhoto(photo: LoginPhoto) {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await showConfirm(`Hapus foto login "${photo.title}"? Foto ini akan dihapus dari halaman login.`))) return;
      await api.delete(`/admin/login-photos/${photo.id}`);
      setPhotos(items => items.filter(item => item.id !== photo.id));
      showToast('Foto login berhasil dihapus', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Gagal menghapus foto login'), 'error');
    } finally { setBusy(false); }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="login-photo-heading">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-primary text-[22px]">photo_library</span>
        </div>
        <div className="flex-1 min-w-[160px]">
          <h3 id="login-photo-heading" className="font-bold text-slate-800 text-[15px]">Foto Halaman Login</h3>
          <p className="text-xs text-slate-500">Kelola foto latar pada panel kiri halaman login desktop.</p>
        </div>
        <button type="button" onClick={() => openEditor(null)} disabled={busy || loading || editorOpen || !!error} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50">Tambah Foto</button>
      </div>
      <div className="p-5 space-y-5">
        <p className="text-xs text-slate-500">Foto aktif ditampilkan sesuai urutan dan berganti setiap 6 detik. Jika tidak ada foto aktif, gambar bawaan kereta digunakan.</p>
        {loading ? <p className="text-sm text-slate-500" role="status">Memuat foto login...</p> : error ? (
          <div role="alert" className="text-sm text-rose-600 flex items-center gap-3">{error}<button type="button" onClick={() => void fetchPhotos()} className="underline">Coba lagi</button></div>
        ) : null}
        {editorOpen && (
          <form onSubmit={savePhoto} className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-4">
            <h4 className="font-bold text-slate-800">{editing ? 'Edit Foto Login' : 'Tambah Foto Login'}</h4>
            <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
              <div>
                <label htmlFor="login-photo-title" className="block text-sm font-semibold text-slate-700 mb-1">Judul foto</label>
                <input id="login-photo-title" required maxLength={150} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Contoh: Kereta di Stasiun Yogyakarta" />
              </div>
              <div>
                <label htmlFor="login-photo-file" className="block text-sm font-semibold text-slate-700 mb-1">{editing ? 'Ganti file foto (opsional)' : 'File foto'}</label>
                <input key={editing?.id ?? 'new'} id="login-photo-file" type="file" accept="image/png,image/jpeg" required={!editing} aria-describedby="login-photo-file-help" onChange={e => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(null);
                  setFileError('');
                  if (!selected) return;
                  if (!['image/png', 'image/jpeg'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
                    setFileError('Pilih file PNG atau JPG dengan ukuran maksimal 5 MB');
                    e.target.value = '';
                    return;
                  }
                  setFile(selected);
                  if (!form.title) setForm({ ...form, title: selected.name.replace(/\.[^.]+$/, '').slice(0, 150) });
                }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-primary" />
                <p id="login-photo-file-help" className="mt-1 text-xs text-slate-500">PNG/JPG, maksimal 5 MB dan 40 megapiksel. Gunakan foto dengan resolusi tinggi.</p>
                {fileError && <p role="alert" className="mt-2 text-sm text-rose-600">{fileError}</p>}
              </div>
              {(preview || editing) && <img src={preview || loginPhotoUrl(editing!)} alt="Pratinjau foto login" className="w-full max-h-64 object-cover rounded-lg bg-slate-100" />}
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label htmlFor="login-photo-order" className="block text-sm font-semibold text-slate-700 mb-1">Urutan tampil</label>
                  <input id="login-photo-order" type="number" min={0} max={9999} step={1} required value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2 py-2 text-sm text-slate-700"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Tampilkan di halaman login</label>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={!!fileError || !form.title.trim()} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">{busy ? 'Menyimpan...' : 'Simpan Foto'}</button>
                <button type="button" onClick={() => { setEditorOpen(false); setFile(null); }} className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold">Batal</button>
              </div>
            </fieldset>
          </form>
        )}
        {!loading && !error && (photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Belum ada foto tambahan. Halaman login menggunakan gambar bawaan kereta.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {photos.map(photo => (
              <article key={photo.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <img src={loginPhotoUrl(photo)} alt={photo.title} className="w-full h-40 object-cover bg-slate-100" />
                <div className="p-3 space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 break-words">{photo.title}</h4>
                  <div className="flex items-center justify-between text-xs"><span className={photo.isActive ? 'text-emerald-700' : 'text-slate-500'}>{photo.isActive ? 'Aktif' : 'Nonaktif'}</span><span className="text-slate-500">Urutan {photo.sortOrder}</span></div>
                  <div className="flex gap-2">
                    <button type="button" aria-label={`Edit foto ${photo.title}`} onClick={() => openEditor(photo)} disabled={busy || editorOpen} className="flex-1 py-2 rounded-lg bg-blue-50 text-primary text-xs font-bold disabled:opacity-50">Edit</button>
                    <button type="button" aria-label={`Hapus foto ${photo.title}`} onClick={() => void deletePhoto(photo)} disabled={busy || editorOpen} className="flex-1 py-2 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold disabled:opacity-50">Hapus</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
