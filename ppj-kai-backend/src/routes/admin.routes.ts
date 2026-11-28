import { validatePositiveParam } from '../middleware/params';
import { getAdminTugasById } from '../controllers/assignment.controller';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin, requireAdminLike, requireCanWrite, requireRole } from '../middleware/auth.middleware';
import { createQcNote, deleteQcNote, getQcNotes, getQcSummary } from '../controllers/qc.controller';
import { getWarningReport } from '../controllers/warningReport.controller';
import {
  getStats, getAllPetugas, getAvailablePetugas, addPetugasToManager,
  removePetugasFromManager, getAllTugas, createTugas, deleteTugas, getAllEmergency, getEmergencyPhoto, updateEmergencyStatus,
  getAllUsers, createUser, updateUser, deleteUser, getAllWilayah, getLivePositions, getAuditLog,
  downloadTugasTemplate, importTugasFromExcel,
  getKategoriTemuan, createKategoriTemuan, updateKategoriTemuan, deleteKategoriTemuan,
  reorderKategoriTemuan,
} from '../controllers/admin.controller';
import { approveTracking, forceStopTracking, rejectTracking } from '../controllers/tracking.controller';
import { createTrainSchedule, deleteTrainSchedule, getTrainSchedules, updateTrainSchedule } from '../controllers/trainSchedule.controller';
import { createMapLocation, deleteMapLocation, getMapLocations, searchMapLocations } from '../controllers/mapLocation.controller';
import { uploadLimiter } from '../middleware/rateLimiter';
import loginPhotoRoutes from './loginPhoto.routes';

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
router.param('id', validatePositiveParam);
router.param('tugasId', validatePositiveParam);
router.use('/login-photos', loginPhotoRoutes);

// ── Read endpoints — admin, qc, kupt ──
router.get('/stats', requireAuth, requireAdminLike, getStats);
router.get('/petugas', requireAuth, requireAdminLike, getAllPetugas);
router.get('/tugas', requireAuth, requireAdminLike, getAllTugas);
router.get('/emergency', requireAuth, requireAdminLike, getAllEmergency);
router.get('/emergency/:id/foto', requireAuth, requireAdminLike, getEmergencyPhoto);
router.get('/live-positions', requireAuth, requireAdminLike, getLivePositions);
router.get('/qc/summary', requireAuth, requireAdminLike, getQcSummary);
router.get('/warnings', requireAuth, requireAdminLike, getWarningReport);
router.get('/tugas/:id/qc-notes', requireAuth, requireAdminLike, getQcNotes);

// ── Catatan QC — hanya QC yang menulis; pengelola membaca lewat GET di atas ──
router.post('/tugas/:id/qc-notes', requireAuth, requireRole('qc'), createQcNote);
router.delete('/qc-notes/:id', requireAuth, requireRole('qc'), deleteQcNote);

// ── Write endpoints — admin + kupt only ──
router.get('/petugas/available', requireAuth, requireCanWrite, getAvailablePetugas);
router.post('/petugas/add', requireAuth, requireCanWrite, addPetugasToManager);
router.post('/petugas/remove', requireAuth, requireCanWrite, removePetugasFromManager);
router.post('/tugas', requireAuth, requireCanWrite, createTugas);
router.delete('/tugas/:id', requireAuth, requireCanWrite, deleteTugas);
// Approval by the managing admin or KUPT; the controller scopes by managerId.
router.post('/tracking/:id/approve', requireAuth, requireCanWrite, approveTracking);
router.post('/tracking/:id/force-stop', requireAuth, requireCanWrite, forceStopTracking);
router.post('/tracking/:id/reject', requireAuth, requireCanWrite, rejectTracking);
// Status penanganan laporan temuan; controller membatasi ke petugas kelolaan (managerId).
router.patch('/emergency/:id/status', requireAuth, requireCanWrite, updateEmergencyStatus);

// ── CRUD jadwal kereta — admin only ──
router.get('/train-schedules', requireAuth, requireAdmin, getTrainSchedules);
router.post('/train-schedules', requireAuth, requireAdmin, createTrainSchedule);
router.patch('/train-schedules/:id', requireAuth, requireAdmin, updateTrainSchedule);
router.delete('/train-schedules/:id', requireAuth, requireAdmin, deleteTrainSchedule);

// ── Excel import/export — admin + kupt only ──
router.get('/tugas/template', requireAuth, requireCanWrite, downloadTugasTemplate);
router.post('/tugas/import', requireAuth, requireCanWrite, uploadLimiter, upload.single('file'), importTugasFromExcel);

// ── Kategori Temuan — global for every wilayah, so only the super admin changes it ──
router.get('/kategori-temuan', requireAuth, requireAdminLike, getKategoriTemuan);
router.post('/kategori-temuan', requireAuth, requireAdmin, createKategoriTemuan);
router.patch('/kategori-temuan/reorder', requireAuth, requireAdmin, reorderKategoriTemuan);
router.patch('/kategori-temuan/:id', requireAuth, requireAdmin, updateKategoriTemuan);
router.delete('/kategori-temuan/:id', requireAuth, requireAdmin, deleteKategoriTemuan);

// ── Account management — admin only ──
router.get('/users', requireAuth, requireAdmin, getAllUsers);
router.post('/users', requireAuth, requireAdmin, createUser);
router.patch('/users/:id', requireAuth, requireAdmin, updateUser);
router.delete('/users/:id', requireAuth, requireAdmin, deleteUser);
router.get('/wilayah', requireAuth, requireAdmin, getAllWilayah);
router.get('/audit-log', requireAuth, requireAdmin, getAuditLog);

// ── Admin custom map locations ──
router.get('/map-locations', requireAuth, requireAdmin, getMapLocations);
router.post('/map-locations', requireAuth, requireAdmin, createMapLocation);
router.delete('/map-locations/:id', requireAuth, requireAdmin, deleteMapLocation);
router.get('/map-search', requireAuth, requireAdmin, searchMapLocations);

router.get('/tugas/:id', requireAuth, requireAdminLike, getAdminTugasById);

export default router;
