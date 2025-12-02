import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '@dms/config';
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
import { genericSensitiveRateLimiter } from './middlewares/rateLimit';
import { logInfo, logError } from './lib/logger';

const env = parseEnv(process.env);

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: env.CORS_ORIGIN ?? 'http://localhost:3000',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      credentials: false,
    }),
  );

  app.use((req, res, next) => {
    const headerReqId = req.header('x-request-id');
    const reqId = headerReqId && headerReqId.trim().length > 0 ? headerReqId : randomUUID();
    req.requestId = reqId;

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      logInfo('http_access', {
        reqId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.auth?.userId ?? undefined,
      });
    });

    next();
  });

  app.get('/health', (_req, res) => {
    const payload: HealthResponse = { status: 'ok' };
    res.status(200).json(payload);
  });

  app.use('/auth', genericSensitiveRateLimiter, authRoutes);

  app.use(
    '/patients',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('RECEPTION', 'DOCTOR', 'ADMIN'),
    patientRoutes,
  );
  app.use(
    '/visits',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('RECEPTION', 'DOCTOR', 'ADMIN'),
    visitRoutes,
  );
  app.use(
    '/reports',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN'),
    reportsRoutes,
  );
  app.use(
    '/xrays',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN'),
    xrayRouter,
  );
  app.use(
    '/rx',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN'),
    rxRouter,
  );
  app.use(
    '/medicines',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN'),
    medicinesRouter,
  );
  app.use(
    '/rx-presets',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN'),
    rxPresetsRouter,
  );

  app.use(
    '/admin/doctors',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN'),
    adminDoctorsRouter,
  );
  app.use(
    '/admin/rx-presets',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN'),
    adminRxPresetsRouter,
  );

  app.use(
    (err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) return next(err);

      if (err instanceof AuthError) {
        const errorCode = err.code ?? 'AUTH_ERROR';

        logInfo('auth_error', {
          reqId: req.requestId,
          userId: req.auth?.userId ?? undefined,
          code: errorCode,
          errorCode,
          message: err.message,
          path: req.path,
          method: req.method,
        });

        return res.status(err.statusCode).json({
          error: err.code,
          message: err.message,
        });
      }

      if (err instanceof Error) {
        const anyErr = err as Error & { code?: string };

        logError('unhandled_error', {
          reqId: req.requestId,
          userId: req.auth?.userId ?? undefined,
          name: err.name,
          message: err.message,
          stack: err.stack,
          path: req.path,
          method: req.method,
          errorCode: anyErr.code ?? 'UNEXPECTED',
        });
      } else {
        logError('unhandled_error_non_error', {
          reqId: req.requestId,
          userId: req.auth?.userId ?? undefined,
          error: err,
          path: req.path,
          method: req.method,
          errorCode: 'UNEXPECTED',
        });
      }

      return res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error',
      });
    },
  );

  return app;
};
