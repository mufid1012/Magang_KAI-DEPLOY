import { Router } from 'express';
import { getGuestMapData } from '../controllers/guest.controller';

const router = Router();

// Public — no auth required
router.get('/map-data', getGuestMapData);

export default router;
