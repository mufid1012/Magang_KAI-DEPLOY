import { Router } from 'express';
import { getRailwayGeometry } from '../controllers/railway.controller';
import { publicApiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public because the Guest map also consumes railway geometry.
router.post('/geometry', publicApiLimiter, getRailwayGeometry);

export default router;
