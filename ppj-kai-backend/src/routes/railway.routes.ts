import { Router } from 'express';
import { getRailwayGeometry } from '../controllers/railway.controller';

const router = Router();

// Public because the Guest map also consumes railway geometry.
router.post('/geometry', getRailwayGeometry);

export default router;
