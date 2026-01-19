import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';

type EnvLike = {
  CORS_ORIGIN?: string | undefined;
  NODE_ENV?: string | undefined;
};

type CorsMiddleware = (req: Request, res: Response, next: (err?: unknown) => void) => void;

export const createSecurityMiddleware = (env: EnvLike) => {
  const origin = env.CORS_ORIGIN ?? 'http://localhost:3000';

  const corsRaw = cors({
    origin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
      'idempotency-key',
    ],
    credentials: true,
  }) as unknown as CorsMiddleware;

  return (req: Request, res: Response, next: NextFunction) => {
    corsRaw(req, res, (err?: unknown) => {
      if (err) return next(err);

      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('Referrer-Policy', 'no-referrer');
      res.header('X-XSS-Protection', '0');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }

      return next();
    });
  };
};
