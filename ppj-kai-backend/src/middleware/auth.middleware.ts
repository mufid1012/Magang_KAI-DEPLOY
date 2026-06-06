import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Attach user to request
  (req as any).user = decoded;
  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }

  next();
};

/**
 * Factory middleware: cek apakah user.role ada di daftar roles yang diizinkan.
 * Usage: requireRole('admin', 'qc', 'kupt')
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' | ')}`,
      });
    }

    next();
  };
};

/**
 * Shortcut: admin, qc, kupt — untuk endpoint read-only (stats, view petugas, view tugas, dll.)
 */
export const requireAdminLike = requireRole('admin', 'qc', 'kupt');

/**
 * Shortcut: admin, kupt — untuk endpoint CRUD (create/delete tugas, manage petugas)
 */
export const requireCanWrite = requireRole('admin', 'kupt');
