import express from 'express';
import cors from 'cors';
import { parseEnv } from '@dms/config/env';
import type { HealthResponse } from '@dms/types';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';

const env = parseEnv(process.env);

export const createApp = () => {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
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
  app.use('/patients', patientRoutes);

  return app;
};
