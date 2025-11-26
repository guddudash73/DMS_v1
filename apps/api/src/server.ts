import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { parseEnv } from '@dms/config/env';
import type { HealthResponse } from '@dms/types';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import visitRoutes from './routes/visits';
import reportsRoutes from './routes/reports';
import xrayRouter from './routes/xray';
import rxRouter from './routes/rx';
import medicinesRouter from './routes/medicines';
import rxPresetsRouter from './routes/rx-presets';
import adminDoctorsRouter from './routes/admin-doctors';
import adminRxPresetsRouter from './routes/admin-rx-presets';
import { authMiddleware, requireRole, AuthError } from './middlewares/auth';

const env = parseEnv(process.env);

export const createApp = () => {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: env.CORS_ORIGIN ?? 'http://localhost:3000',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    }),
  );

  app.get('/health', (_req, res) => {
    const payload: HealthResponse = { status: 'ok' };
    res.status(200).json(payload);
  });

  app.use('/auth', authRoutes);

  app.use('/patients', authMiddleware, requireRole('RECEPTION', 'DOCTOR', 'ADMIN'), patientRoutes);
  app.use('/visits', authMiddleware, requireRole('RECEPTION', 'DOCTOR', 'ADMIN'), visitRoutes);
  app.use('/reports', authMiddleware, requireRole('ADMIN'), reportsRoutes);
  app.use('/xrays', authMiddleware, requireRole('DOCTOR', 'ADMIN'), xrayRouter);
  app.use('/rx', authMiddleware, requireRole('DOCTOR', 'ADMIN'), rxRouter);
  app.use('/medicines', authMiddleware, requireRole('DOCTOR', 'ADMIN'), medicinesRouter);
  app.use('/rx-presets', authMiddleware, requireRole('DOCTOR', 'ADMIN'), rxPresetsRouter);

  app.use('/admin/doctors', authMiddleware, requireRole('ADMIN'), adminDoctorsRouter);
  app.use('/admin/rx-presets', authMiddleware, requireRole('ADMIN'), adminRxPresetsRouter);

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) return next(err);

      if (err instanceof AuthError) {
        return res.status(err.statusCode).json({
          error: err.code,
          message: err.message,
        });
      }

      if (err instanceof Error) {
        console.error(
          JSON.stringify(
            {
              msg: 'api:error',
              name: err.name,
              message: err.message,
              stack: err.stack,
            },
            null,
            2,
          ),
        );
      } else {
        console.error(
          JSON.stringify(
            {
              msg: 'api:error',
              error: err,
            },
            null,
            2,
          ),
        );
      }

      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error',
      });
    },
  );

  return app;
};
