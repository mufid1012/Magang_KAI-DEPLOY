import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireAdminLike, requireCanWrite } from '../middleware/auth.middleware';
import {
  getStats, getAllPetugas, getAvailablePetugas, addPetugasToManager,
  removePetugasFromManager, getAllTugas, createTugas, deleteTugas, getAllEmergency,
  getAllUsers, createUser, updateUser, deleteUser, getAllWilayah, getLivePositions,
  downloadTugasTemplate, importTugasFromExcel,
  getKategoriTemuan, createKategoriTemuan, updateKategoriTemuan, deleteKategoriTemuan,
  reorderKategoriTemuan,
} from '../controllers/admin.controller';
import { createMapLocation, deleteMapLocation, getMapLocations, searchMapLocations } from '../controllers/mapLocation.controller';

// Multer memory storage for Excel file uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

const router = Router();

// ── Read endpoints — admin, qc, kupt ──
router.get('/stats', requireAuth, requireAdminLike, getStats);
router.get('/petugas', requireAuth, requireAdminLike, getAllPetugas);
router.get('/tugas', requireAuth, requireAdminLike, getAllTugas);
router.get('/emergency', requireAuth, requireAdminLike, getAllEmergency);
router.get('/live-positions', requireAuth, requireAdminLike, getLivePositions);

// ── Write endpoints — admin + kupt only ──
router.get('/petugas/available', requireAuth, requireCanWrite, getAvailablePetugas);
router.post('/petugas/add', requireAuth, requireCanWrite, addPetugasToManager);
router.post('/petugas/remove', requireAuth, requireCanWrite, removePetugasFromManager);
router.post('/tugas', requireAuth, requireCanWrite, createTugas);
router.delete('/tugas/:id', requireAuth, requireCanWrite, deleteTugas);

// ── Excel import/export — admin + kupt only ──
router.get('/tugas/template', requireAuth, requireCanWrite, downloadTugasTemplate);
router.post('/tugas/import', requireAuth, requireCanWrite, upload.single('file'), importTugasFromExcel);

// ── Kategori Temuan CRUD — admin + kupt ──
router.get('/kategori-temuan', requireAuth, requireAdminLike, getKategoriTemuan);
router.post('/kategori-temuan', requireAuth, requireCanWrite, createKategoriTemuan);
router.patch('/kategori-temuan/reorder', requireAuth, requireCanWrite, reorderKategoriTemuan);
router.patch('/kategori-temuan/:id', requireAuth, requireCanWrite, updateKategoriTemuan);
router.delete('/kategori-temuan/:id', requireAuth, requireCanWrite, deleteKategoriTemuan);

// ── Account management — admin only ──
router.get('/users', requireAuth, requireAdmin, getAllUsers);
router.post('/users', requireAuth, requireAdmin, createUser);
router.patch('/users/:id', requireAuth, requireAdmin, updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, deleteUser);
router.get('/wilayah', requireAuth, requireAdmin, getAllWilayah);

// ── Admin custom map locations ──
router.get('/map-locations', requireAuth, requireAdmin, getMapLocations);
router.post('/map-locations', requireAuth, requireAdmin, createMapLocation);
router.delete('/map-locations/:id', requireAuth, requireAdmin, deleteMapLocation);
router.get('/map-search', requireAuth, requireAdmin, searchMapLocations);

export default router;
