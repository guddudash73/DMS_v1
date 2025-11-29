import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@dms/types';
import { verifyAccessToken } from '../lib/authTokens';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      userId: string;
      role: Role;
      token: string;
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
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AuthError('Missing Authorization header'));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(new AuthError('Empty Authorization token'));
  }

  try {
    const decoded = verifyAccessToken(token);
    req.auth = {
      userId: decoded.sub,
      role: decoded.role,
      token,
    };
    return next();
  } catch {
    return next(new AuthError('Invalid or expired access token'));
  }
};

export const requireRole =
  (...allowed: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AuthError('Missing auth context'));
    }
    if (!allowed.includes(req.auth.role)) {
      return next(new AuthError('Forbidden', 403, 'FORBIDDEN'));
    }
    return next();
  };
