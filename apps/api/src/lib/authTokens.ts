import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
} from '../config/env';
import type { JwtClaims, RefreshTokenClaims, Role } from '@dms/types';

export interface TokenPair {
  access: { token: string; exp: number };
  refresh: { token: string; exp: number; jti: string };
}

export const signAccessToken = (userId: string, role: Role): { token: string; exp: number } => {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + ACCESS_TOKEN_TTL_SEC;
  const payload: JwtClaims = {
    sub: userId,
    role,
    iat: nowSec,
    exp,
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
  const payload: RefreshTokenClaims = {
    sub: userId,
    role,
    iat: nowSec,
    exp,
    jti,
    type: 'refresh',
  };
  const token = jwt.sign(payload, JWT_REFRESH_SECRET, { algorithm: 'HS256' });
  return { token, exp, jti };
};

export const verifyAccessToken = (token: string): JwtClaims => {
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as JwtClaims;
  return decoded;
};

export const verifyRefreshToken = (token: string): RefreshTokenClaims => {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenClaims;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token type');
  }
  return decoded;
};

export const buildTokenPair = (userId: string, role: Role): TokenPair => {
  const access = signAccessToken(userId, role);
  const refresh = signRefreshToken(userId, role);
  return { access, refresh };
};
