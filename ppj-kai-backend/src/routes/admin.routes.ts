import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireAdminLike, requireCanWrite } from '../middleware/auth.middleware';
import {
  getStats, getAllPetugas, getAvailablePetugas, addPetugasToManager,
  removePetugasFromManager, getAllTugas, createTugas, deleteTugas, getAllEmergency,
  getAllUsers, createUser, updateUser, deleteUser, getAllWilayah, getLivePositions,
} from '../controllers/admin.controller';
import {
  downloadExcelTemplate, importExcel,
  getTemplates, createTemplate, deleteTemplate, applyTemplate,
} from '../controllers/import.controller';

const router = Router();

// Multer config for Excel upload (memory storage, max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file .xlsx yang diizinkan'));
    }
  },
});

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

// ── Import & Template endpoints — admin + kupt only ──
router.get('/tugas/template-excel', requireAuth, requireCanWrite, downloadExcelTemplate);
router.post('/tugas/import-excel', requireAuth, requireCanWrite, upload.single('file'), importExcel);
router.get('/templates', requireAuth, requireCanWrite, getTemplates);
router.post('/templates', requireAuth, requireCanWrite, createTemplate);
router.delete('/templates/:id', requireAuth, requireCanWrite, deleteTemplate);
router.post('/templates/:id/apply', requireAuth, requireCanWrite, applyTemplate);

// ── Account management — admin only ──
router.get('/users', requireAuth, requireAdmin, getAllUsers);
router.post('/users', requireAuth, requireAdmin, createUser);
router.patch('/users/:id', requireAuth, requireAdmin, updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, deleteUser);
router.get('/wilayah', requireAuth, requireAdmin, getAllWilayah);

export default router;

