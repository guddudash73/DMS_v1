// apps/api/src/server.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '@dcm/config';
import type { HealthResponse } from '@dcm/types';

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
import adminMedicinesRouter from './routes/admin-medicines';
import doctorsRouter from './routes/doctors';

import { authMiddleware, requireRole } from './middlewares/auth';
import { genericSensitiveRateLimiter } from './middlewares/rateLimit';
import { logInfo } from './lib/logger';
import { errorHandler } from './middlewares/errorHandler';
import meRouter from './routes/me';
import followupsRouter from './routes/followups';
import adminUsersRouter from './routes/admin-users';
import { createSecurityMiddleware } from './middlewares/securityHeaders';

const env = parseEnv(process.env);

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);

  // ✅ Single source of truth for CORS + security headers.
  // Do NOT add another cors() middleware elsewhere.
  app.use(createSecurityMiddleware(env));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

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
    requireRole('ADMIN', 'DOCTOR', 'RECEPTION'),
    reportsRoutes,
  );

  app.use(
    '/xrays',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    xrayRouter,
  );
  app.use(
    '/xray',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    xrayRouter,
  );

  app.use(
    '/rx',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
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
    '/admin/medicines',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN'),
    adminMedicinesRouter,
  );

  app.use(
    '/rx-presets',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    rxPresetsRouter,
  );

  app.use(
    '/doctors',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN', 'RECEPTION', 'DOCTOR'),
    doctorsRouter,
  );

  app.use(
    '/admin/doctors',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN', 'RECEPTION'),
    adminDoctorsRouter,
  );

  app.use(
    '/admin/users',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN'),
    adminUsersRouter,
  );

  app.use(
    '/admin/rx-presets',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('ADMIN'),
    adminRxPresetsRouter,
  );

  app.use('/me', authMiddleware, meRouter);

  app.use(
    '/followups',
    genericSensitiveRateLimiter,
    authMiddleware,
    requireRole('RECEPTION', 'ADMIN'),
    followupsRouter,
  );

  app.use(errorHandler);

  return app;
};
