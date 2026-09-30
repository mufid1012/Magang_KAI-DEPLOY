import { rateLimit } from 'express-rate-limit';

const response = { success: false, message: 'Terlalu banyak percobaan. Silakan coba lagi nanti.' };

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: response,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Batas unggah tercapai. Silakan coba lagi nanti.' },
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak request. Silakan coba lagi sebentar.' },
});

