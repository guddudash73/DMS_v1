// packages/types/src/auth.ts
import { z } from 'zod';
import { Role, UserId } from './user';

export const LoginRequest = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RefreshRequest = z.object({
  refreshToken: z.string().min(20).optional(),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

const BaseClaims = z.object({
  sub: UserId,
  role: Role,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export const JwtClaims = BaseClaims.extend({
  type: z.literal('access'),
});
export type JwtClaims = z.infer<typeof JwtClaims>;

export const RefreshTokenClaims = BaseClaims.extend({
  jti: z.string().min(10),
  type: z.literal('refresh'),
});
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaims>;

export const AccessTokenBundle = z.object({
  accessToken: z.string(),
  expiresInSec: z.number().int().nonnegative(),
});
export type AccessTokenBundle = z.infer<typeof AccessTokenBundle>;

export const LoginResponse = z.object({
  userId: UserId,
  role: Role,
  tokens: AccessTokenBundle,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const RefreshResponse = z.object({
  userId: UserId,
  role: Role,
  tokens: AccessTokenBundle,
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;
