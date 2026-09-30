import { Router } from 'express';
import { login, getMe, updateProfile } from '../controllers/auth.controller';

import { requireAuth } from '../middleware/auth.middleware';
import { loginLimiter } from '../middleware/rateLimiter';

const router = Router();

// Public routes
router.post('/login', loginLimiter, login);

// Protected routes
router.get('/me', requireAuth, getMe);
router.patch('/profile', requireAuth, updateProfile);

export default router;
