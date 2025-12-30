import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
} from '../config/env';
import { JwtClaims, RefreshTokenClaims } from '@dms/types';
import type { Role } from '@dms/types';

export interface TokenPair {
  access: { token: string; exp: number };
  refresh: { token: string; exp: number; jti: string };
}

const CLOCK_TOLERANCE_SEC = 10;

export const signAccessToken = (userId: string, role: Role): { token: string; exp: number } => {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + ACCESS_TOKEN_TTL_SEC;

  const payload = {
    sub: userId,
    role,
    iat: nowSec,
    exp,
    type: 'access' as const,
  };

  const token = jwt.sign(payload, JWT_ACCESS_SECRET, { algorithm: 'HS256' });
  return { token, exp };
};

export const signRefreshToken = (
  userId: string,
  role: Role,
): { token: string; exp: number; jti: string } => {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + REFRESH_TOKEN_TTL_SEC;
  const jti = randomUUID();

  const payload = {
    sub: userId,
    role,
    iat: nowSec,
    exp,
    jti,
    type: 'refresh' as const,
  };

  const token = jwt.sign(payload, JWT_REFRESH_SECRET, { algorithm: 'HS256' });
  return { token, exp, jti };
};

export const verifyAccessToken = (token: string) => {
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    clockTolerance: CLOCK_TOLERANCE_SEC,
  });

  const parsed = JwtClaims.safeParse(decoded);
  if (!parsed.success) {
    throw new Error('Invalid access token claims');
  }

  return parsed.data;
};

export const verifyRefreshToken = (token: string) => {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
    clockTolerance: CLOCK_TOLERANCE_SEC,
  });

  const parsed = RefreshTokenClaims.safeParse(decoded);
  if (!parsed.success) {
    throw new Error('Invalid refresh token claims');
  }

  if (parsed.data.type !== 'refresh') {
    throw new Error('Invalid refresh token type');
  }

  return parsed.data;
};

export const buildTokenPair = (userId: string, role: Role): TokenPair => {
  const access = signAccessToken(userId, role);
  const refresh = signRefreshToken(userId, role);
  return { access, refresh };
};
