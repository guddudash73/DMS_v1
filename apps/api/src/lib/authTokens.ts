import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JwtClaims, RefreshTokenClaims } from '@dcm/types';
import type { Role } from '@dcm/types';

export interface TokenPair {
  access: { token: string; exp: number };
  refresh: { token: string; exp: number; jti: string };
}

const CLOCK_TOLERANCE_SEC = 10;

const AuthEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24),
});

type AuthEnv = z.infer<typeof AuthEnvSchema>;

let cached: AuthEnv | undefined;
function getAuthEnv(): AuthEnv {
  if (cached) return cached;

  const parsed = AuthEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `[authTokens] Missing/invalid env:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export const signAccessToken = (userId: string, role: Role): { token: string; exp: number } => {
  const { ACCESS_TOKEN_TTL_SEC, JWT_ACCESS_SECRET } = getAuthEnv();

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
  const { REFRESH_TOKEN_TTL_SEC, JWT_REFRESH_SECRET } = getAuthEnv();

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
  const { JWT_ACCESS_SECRET } = getAuthEnv();

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
  const { JWT_REFRESH_SECRET } = getAuthEnv();

  const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
    clockTolerance: CLOCK_TOLERANCE_SEC,
  });

  const parsed = RefreshTokenClaims.safeParse(decoded);
  if (!parsed.success) {
    throw new Error('Invalid refresh token claims');
  }

  return parsed.data;
};

export const buildTokenPair = (userId: string, role: Role): TokenPair => {
  const access = signAccessToken(userId, role);
  const refresh = signRefreshToken(userId, role);
  return { access, refresh };
};
