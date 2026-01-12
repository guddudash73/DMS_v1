import jwt from 'jsonwebtoken';
import { getEnv } from '../../src/config/env';
import { TEST_USER_IDS } from './testUsers';

const env = getEnv();

function requireString(name: string, value: string | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is not set (required for test auth token signing).`);
  }
  return value;
}

function requireNumber(name: string, value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${name} is not a valid positive number (required for test auth token signing).`,
    );
  }
  return value;
}

const JWT_ACCESS_SECRET = requireString('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET);
const ACCESS_TOKEN_TTL_SEC = requireNumber('ACCESS_TOKEN_TTL_SEC', env.ACCESS_TOKEN_TTL_SEC);

function signAccessToken(userId: string, role: string) {
  // Common JWT shapes: { sub, role } and sometimes { userId } too
  const payload = { role, userId };

  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
  });
}

export function asAdmin() {
  const token = signAccessToken(TEST_USER_IDS.admin, 'ADMIN');
  return `Bearer ${token}`;
}

export function asDoctor() {
  const token = signAccessToken(TEST_USER_IDS.doctor, 'DOCTOR');
  return `Bearer ${token}`;
}

export function asReception() {
  const token = signAccessToken(TEST_USER_IDS.reception, 'RECEPTION');
  return `Bearer ${token}`;
}
