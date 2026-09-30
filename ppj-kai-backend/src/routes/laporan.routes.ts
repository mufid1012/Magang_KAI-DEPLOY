import { Router } from 'express';
import { createLaporan, getLaporan } from '../controllers/laporan.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/', requireRole('ppj'), createLaporan);
router.get('/', requireRole('ppj', 'admin', 'kupt', 'qc'), getLaporan);

export default router;
