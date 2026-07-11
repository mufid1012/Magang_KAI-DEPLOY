import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireAdminLike, requireCanWrite } from '../middleware/auth.middleware';
import {
  getStats, getAllPetugas, getAvailablePetugas, addPetugasToManager,
  removePetugasFromManager, getAllTugas, createTugas, deleteTugas, getAllEmergency,
  getAllUsers, createUser, updateUser, deleteUser, getAllWilayah, getLivePositions,
  downloadTugasTemplate, importTugasFromExcel,
} from '../controllers/admin.controller';

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

// ── Account management — admin only ──
router.get('/users', requireAuth, requireAdmin, getAllUsers);
router.post('/users', requireAuth, requireAdmin, createUser);
router.patch('/users/:id', requireAuth, requireAdmin, updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, deleteUser);
router.get('/wilayah', requireAuth, requireAdmin, getAllWilayah);

export default router;
