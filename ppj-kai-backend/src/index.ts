import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import prisma from './config/database';
import { getAllowedOrigins, validateRuntimeEnvironment } from './config/env';
import authRoutes from './routes/auth.routes';
import tugasRoutes from './routes/tugas.routes';
import trackingRoutes from './routes/tracking.routes';
import laporanRoutes from './routes/laporan.routes';
import adminRoutes from './routes/admin.routes';
import guestRoutes from './routes/guest.routes';
import railwayRoutes from './routes/railway.routes';
import { getActiveKategoriTemuan } from './controllers/admin.controller';
import { startMissedTaskScheduler } from './lib/scheduler';

validateRuntimeEnvironment();

const app = express();
const port = process.env.PORT || 5001;
const allowedOrigins = new Set(getAllowedOrigins());

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isSafeInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// Middleware
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Requests without Origin are same-origin or non-browser clients. They are
    // still protected by authentication and authorization at each route.
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
}));
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
app.use('/api/railway', railwayRoutes);

// Public: active emergency categories (no auth required)
app.get('/api/kategori-temuan', getActiveKategoriTemuan);

// Test DB Connection
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // A simple query to check DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check failed');
    res.status(500).json({ status: 'error', database: 'disconnected' });
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
  startMissedTaskScheduler();
});
