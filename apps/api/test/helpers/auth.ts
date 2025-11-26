import jwt from 'jsonwebtoken';
import type { JwtClaims, Role } from '@dms/types';
import { JWT_ACCESS_SECRET } from '../../src/config/env';

export const makeAccessToken = (role: Role, overrides?: Partial<JwtClaims>): string => {
  const nowSec = Math.floor(Date.now() / 1000);

  const claims: JwtClaims = {
    sub: overrides?.sub ?? 'test-user-id',
    role,
    iat: nowSec,
    exp: nowSec + 60 * 60,
  };

  return jwt.sign(claims, JWT_ACCESS_SECRET, { algorithm: 'HS256' });
};

export const asReception = () => `Bearer ${makeAccessToken('RECEPTION')}`;
export const asDoctor = () => `Bearer ${makeAccessToken('DOCTOR')}`;
export const asAdmin = () => `Bearer ${makeAccessToken('ADMIN')}`;
