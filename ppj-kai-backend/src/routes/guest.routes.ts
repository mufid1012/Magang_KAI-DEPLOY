import { Router } from 'express';
import { getGuestMapData } from '../controllers/guest.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.get('/map-data', requireAuth, requireRole('guest', 'qc', 'kupt', 'admin'), getGuestMapData);

export default router;
