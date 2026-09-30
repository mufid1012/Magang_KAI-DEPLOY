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
import { approveTracking } from '../controllers/tracking.controller';
import { createTrainSchedule, deleteTrainSchedule, getTrainSchedules, updateTrainSchedule } from '../controllers/trainSchedule.controller';
import { createMapLocation, deleteMapLocation, getMapLocations, searchMapLocations } from '../controllers/mapLocation.controller';
import { uploadLimiter } from '../middleware/rateLimiter';

// Multer memory storage for Excel file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, parts: 6 },
  fileFilter: (_req, file, callback) => {
    const acceptedMimeTypes = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      '',
    ]);
    const isXlsx = file.originalname.toLowerCase().endsWith('.xlsx') && acceptedMimeTypes.has(file.mimetype);
    callback(null, isXlsx);
  },
});

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
router.post('/tracking/:id/approve', requireAuth, requireAdmin, approveTracking);

// ── CRUD jadwal kereta — admin only ──
router.get('/train-schedules', requireAuth, requireAdmin, getTrainSchedules);
router.post('/train-schedules', requireAuth, requireAdmin, createTrainSchedule);
router.patch('/train-schedules/:id', requireAuth, requireAdmin, updateTrainSchedule);
router.delete('/train-schedules/:id', requireAuth, requireAdmin, deleteTrainSchedule);

// ── Excel import/export — admin + kupt only ──
router.get('/tugas/template', requireAuth, requireCanWrite, downloadTugasTemplate);
router.post('/tugas/import', requireAuth, requireCanWrite, uploadLimiter, upload.single('file'), importTugasFromExcel);

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
