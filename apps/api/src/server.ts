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
import meRouter from './routes/me';
import followupsRouter from './routes/followups';
import adminUsersRouter from './routes/admin-users';

import { authMiddleware, requireRole } from './middlewares/auth';
import { genericSensitiveRateLimiter } from './middlewares/rateLimit';
import { logInfo } from './lib/logger';
import { errorHandler } from './middlewares/errorHandler';
import { createSecurityMiddleware } from './middlewares/securityHeaders';

const env = parseEnv(process.env);

export const createApp = () => {
  const app = express();

  // If CloudFront / Router adds proxy headers, keep this.
  app.set('trust proxy', 1);

  // Global middleware (applies to both / and /api)
  app.use(createSecurityMiddleware(env));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Request logging
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

  /**
   * IMPORTANT:
   * Some setups forward requests to Lambda *with* "/api" still present (your case),
   * while others strip it before reaching Express.
   *
   * So we mount the same router at BOTH "/" and "/api".
   */
  const routes = express.Router();

  routes.get('/health', (_req, res) => {
    const payload: HealthResponse = { status: 'ok' };
    res.status(200).json(payload);
  });

  routes.use('/auth', authRoutes);

  routes.use(
    '/patients',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('RECEPTION', 'DOCTOR', 'ADMIN'),
    patientRoutes,
  );

  routes.use(
    '/visits',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('RECEPTION', 'DOCTOR', 'ADMIN'),
    visitRoutes,
  );

  routes.use(
    '/reports',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('ADMIN', 'DOCTOR', 'RECEPTION'),
    reportsRoutes,
  );

  routes.use(
    '/xrays',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    xrayRouter,
  );

  routes.use(
    '/xray',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    xrayRouter,
  );

  routes.use(
    '/rx',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    rxRouter,
  );

  routes.use(
    '/medicines',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('DOCTOR', 'ADMIN'),
    medicinesRouter,
  );

  routes.use(
    '/admin/medicines',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('ADMIN'),
    adminMedicinesRouter,
  );

  routes.use(
    '/rx-presets',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('DOCTOR', 'ADMIN', 'RECEPTION'),
    rxPresetsRouter,
  );

  routes.use(
    '/doctors',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('ADMIN', 'RECEPTION', 'DOCTOR'),
    doctorsRouter,
  );

  routes.use(
    '/admin/doctors',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('ADMIN', 'RECEPTION'),
    adminDoctorsRouter,
  );

  routes.use(
    '/admin/users',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('ADMIN'),
    adminUsersRouter,
  );

  routes.use(
    '/admin/rx-presets',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('ADMIN'),
    adminRxPresetsRouter,
  );

  routes.use('/me', authMiddleware, genericSensitiveRateLimiter, meRouter);

  routes.use(
    '/followups',
    authMiddleware,
    genericSensitiveRateLimiter,
    requireRole('RECEPTION', 'ADMIN'),
    followupsRouter,
  );

  // Mount routes at BOTH base paths
  app.use(routes);
  app.use('/api', routes);

  // Error handler last
  app.use(errorHandler);

  return app;
};
