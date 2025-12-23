import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@dms/types';
import { verifyAccessToken } from '../lib/authTokens';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      userId: string;
      role: Role;
      // Prefer not to store raw token unless you truly need it.
      // token?: string;
    };
    requestId?: string;
  }
}

export class AuthError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('Authorization') ?? req.header('authorization');

  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return next(new AuthError('UNAUTHORIZED', 401, 'UNAUTHORIZED'));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(new AuthError('UNAUTHORIZED', 401, 'UNAUTHORIZED'));
  }

  try {
    const decoded = verifyAccessToken(token);

    req.auth = {
      userId: decoded.sub,
      role: decoded.role,
    };

    return next();
  } catch {
    return next(new AuthError('UNAUTHORIZED', 401, 'UNAUTHORIZED'));
  }
};

export const requireRole =
  (...allowed: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new AuthError('UNAUTHORIZED', 401, 'UNAUTHORIZED'));
    if (!allowed.includes(req.auth.role)) return next(new AuthError('FORBIDDEN', 403, 'FORBIDDEN'));
    return next();
  };
