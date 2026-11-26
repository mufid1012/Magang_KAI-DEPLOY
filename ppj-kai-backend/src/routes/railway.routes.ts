import { Router } from 'express';
import { getRailwayGeometry } from '../controllers/railway.controller';
import { publicApiLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Every map that draws railway geometry (admin, QC, PPJ, guest) is behind login, so the
// Overpass proxy is too; otherwise anyone could use this server to run heavy queries.
router.post('/geometry', requireAuth, publicApiLimiter, getRailwayGeometry);

export default router;
