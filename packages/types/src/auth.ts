import { z } from 'zod';
import { Role, UserId } from './user';

export const LoginRequest = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RefreshRequest = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const JwtClaims = z.object({
  sub: UserId,
  role: Role,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});
export type JwtClaims = z.infer<typeof JwtClaims>;

export const RefreshTokenClaims = JwtClaims.extend({
  jti: z.string().min(10),
  type: z.literal('refresh'),
});
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaims>;

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSec: z.number().int().nonnegative(),
  refreshExpiresInSec: z.number().int().nonnegative(),
});
export type TokenPair = z.infer<typeof TokenPair>;

export const LoginResponse = z.object({
  userId: UserId,
  role: Role,
  tokens: TokenPair,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const RefreshResponse = z.object({
  tokens: TokenPair,
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;
