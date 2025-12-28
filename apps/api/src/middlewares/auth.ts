// apps/api/src/middlewares/auth.ts
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@dms/types';
import { verifyAccessToken } from '../lib/authTokens';
import { userRepository } from '../repositories/userRepository';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      userId: string;
      role: Role;
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

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
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

    // ✅ NEW: enforce active user for every request
    const user = await userRepository.getById(decoded.sub);
    if (!user) {
      return next(new AuthError('UNAUTHORIZED', 401, 'UNAUTHORIZED'));
    }
    if (user.active === false) {
      return next(new AuthError('USER_INACTIVE', 403, 'USER_INACTIVE'));
    }

    req.auth = { userId: decoded.sub, role: decoded.role };
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
