import { Router } from 'express';
import { startTracking, updateTracking, stopTracking, getActiveTracking, createNearbyWarning, getNearbyWarnings } from '../controllers/tracking.controller';
import { getCurrentTrainAlerts } from '../controllers/trainSchedule.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/train-alerts', requireRole('ppj'), getCurrentTrainAlerts);
router.post('/warnings', requireRole('ppj'), createNearbyWarning);
router.get('/warnings/nearby', requireRole('ppj'), getNearbyWarnings);
router.get('/active/:tugasId', requireRole('ppj'), getActiveTracking);
router.post('/start/:tugasId', requireRole('ppj'), startTracking);
router.post('/update/:id', requireRole('ppj'), updateTracking);
router.post('/stop/:id', requireRole('ppj'), stopTracking);

export default router;
