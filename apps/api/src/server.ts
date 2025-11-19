import express from 'express';
import cors from 'cors';
import { parseEnv } from '@dms/config/env';
import type { HealthResponse } from '@dms/types';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import visitRoutes from './routes/visits';
import reportsRoutes from './routes/reports';

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
  app.use('/visits', visitRoutes);
  app.use('/reports', reportsRoutes);

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) {
        return next(err);
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
