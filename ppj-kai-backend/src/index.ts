import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/database';
import authRoutes from './routes/auth.routes';
import tugasRoutes from './routes/tugas.routes';
import trackingRoutes from './routes/tracking.routes';
import laporanRoutes from './routes/laporan.routes';
import adminRoutes from './routes/admin.routes';
import guestRoutes from './routes/guest.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'PPJ KAI API is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tugas', tugasRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/guest', guestRoutes);

// Test DB Connection
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // A simple query to check DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: String(error) });
  }
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
