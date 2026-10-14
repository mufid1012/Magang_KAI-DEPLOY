import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { uploadLimiter, publicApiLimiter } from '../middleware/rateLimiter';
import { createLoginPhoto, deleteLoginPhoto, getLoginPhotoImage, getLoginPhotos, getPublicLoginPhotos, updateLoginPhoto } from '../controllers/loginPhoto.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, parts: 4, fieldSize: 1024 },
}).single('photo');

function uploadPhoto(req: Request, res: Response, next: NextFunction) {
  upload(req, res, error => {
    if (error) return res.status(400).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran foto maksimal 5 MB' : 'Unggahan foto tidak valid',
    });
    next();
  });
}

export const publicLoginPhotoRoutes = Router();
publicLoginPhotoRoutes.use(publicApiLimiter);
publicLoginPhotoRoutes.get('/', getPublicLoginPhotos);
publicLoginPhotoRoutes.get('/:id/image', getLoginPhotoImage);

const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/', getLoginPhotos);
router.post('/', uploadLimiter, uploadPhoto, createLoginPhoto);
router.patch('/:id', uploadLimiter, uploadPhoto, updateLoginPhoto);
router.delete('/:id', deleteLoginPhoto);
export default router;
