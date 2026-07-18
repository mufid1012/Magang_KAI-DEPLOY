import { Request, Response } from 'express';
import prisma from '../config/database';
import { ensureMapLocationsTable } from '../lib/mapLocationsTable';

interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  type?: string;
}

const searchCache = new Map<string, { expiresAt: number; data: unknown[] }>();
let lastGeocodingRequestAt = 0;
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const GEOCODING_MIN_INTERVAL_MS = 1100;

export const getMapLocations = async (req: AuthRequest, res: Response) => {
  try {
    await ensureMapLocationsTable();
    const data = await prisma.mapLocation.findMany({
      where: { createdBy: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get map locations error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil titik lokasi' });
  }
};

export const createMapLocation = async (req: AuthRequest, res: Response) => {
  try {
    await ensureMapLocationsTable();
    const name = String(req.body.name || '').trim();
    const address = String(req.body.address || '').trim();
    const description = String(req.body.description || '').trim();
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    if (!name) return res.status(400).json({ success: false, message: 'Nama lokasi wajib diisi' });
    if (name.length > 150) return res.status(400).json({ success: false, message: 'Nama lokasi maksimal 150 karakter' });
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ success: false, message: 'Latitude tidak valid' });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Longitude tidak valid' });
    }

    const data = await prisma.mapLocation.create({
      data: {
        name,
        address: address || null,
        description: description || null,
        latitude,
        longitude,
        createdBy: req.user!.id,
      },
    });
    return res.status(201).json({ success: true, data, message: 'Titik lokasi berhasil disimpan' });
  } catch (error) {
    console.error('Create map location error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan titik lokasi' });
  }
};

export const deleteMapLocation = async (req: AuthRequest, res: Response) => {
  try {
    await ensureMapLocationsTable();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'ID lokasi tidak valid' });

    const result = await prisma.mapLocation.deleteMany({
      where: { id, createdBy: req.user!.id },
    });
    if (result.count === 0) return res.status(404).json({ success: false, message: 'Titik lokasi tidak ditemukan' });
    return res.json({ success: true, message: 'Titik lokasi berhasil dihapus' });
  } catch (error) {
    console.error('Delete map location error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus titik lokasi' });
  }
};

export const searchMapLocations = async (req: AuthRequest, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 3) return res.status(400).json({ success: false, message: 'Masukkan minimal 3 karakter pencarian' });
    if (query.length > 200) return res.status(400).json({ success: false, message: 'Pencarian terlalu panjang' });

    const cacheKey = query.toLocaleLowerCase('id-ID');
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const now = Date.now();
    if (now - lastGeocodingRequestAt < GEOCODING_MIN_INTERVAL_MS) {
      return res.status(429).json({ success: false, message: 'Tunggu sebentar sebelum melakukan pencarian berikutnya' });
    }
    lastGeocodingRequestAt = now;

    const baseUrl = process.env.GEOCODING_API_URL || 'https://nominatim.openstreetmap.org/search';
    const url = new URL(baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('countrycodes', 'id');
    url.searchParams.set('addressdetails', '0');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'id,en;q=0.8',
        'User-Agent': 'KAI-RailTrack-PPJ/1.0 (admin map location search)',
        Referer: process.env.APP_URL || 'http://localhost:3000/',
      },
    });
    if (!response.ok) throw new Error(`Geocoding provider returned ${response.status}`);

    const raw = await response.json() as NominatimResult[];
    const data = raw
      .map(item => ({
        id: String(item.place_id),
        name: item.name || item.display_name.split(',')[0],
        displayName: item.display_name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        type: item.type || 'location',
      }))
      .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_MS, data });
    return res.json({ success: true, data, cached: false });
  } catch (error) {
    console.error('Map location search error:', error);
    return res.status(502).json({ success: false, message: 'Layanan pencarian lokasi sedang tidak tersedia' });
  }
};
