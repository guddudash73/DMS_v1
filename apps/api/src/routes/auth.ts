// apps/api/src/routes/auth.ts
import { Router, type Response } from 'express';
import bcrypt from 'bcrypt';
import { validate } from '../middlewares/zod';
import type { LoginResponse, RefreshResponse, RefreshTokenClaims } from '@dms/types';
import { LoginRequest, RefreshRequest } from '@dms/types';
import { userRepository } from '../repositories/userRepository';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository';
import { getEnv } from '../config/env';
import { buildTokenPair, verifyRefreshToken } from '../lib/authTokens';
import { AuthError } from '../middlewares/auth';
import { logInfo, logAudit } from '../lib/logger';
import { loginRateLimiter } from '../middlewares/rateLimit';

const r = Router();

const MAX_LOGIN_ATTEMPTS = 20;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

const COOKIE_NAME = 'refreshToken';

const setRefreshCookie = (res: Response, refreshToken: string) => {
  const env = getEnv();

  res.cookie(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: env.REFRESH_TOKEN_TTL_SEC * 1000,
    path: '/', // ✅ IMPORTANT: allow cookie on all routes
  });
};

const clearRefreshCookie = (res: Response) => {
  const env = getEnv();

  for (const path of ['/', '/auth']) {
    res.cookie(COOKIE_NAME, '', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path,
    });
  }
};

r.post('/login', loginRateLimiter, validate(LoginRequest), async (req, res, next) => {
  try {
    const env = getEnv();
    const { email, password } = req.body as LoginRequest;

    const user = await userRepository.getByEmail(email);
    if (!user) {
      logInfo('auth_login_invalid_user', { reqId: req.requestId, email });
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        traceId: req.requestId,
      });
    }

    if (user.active === false) {
      return res.status(403).json({
        error: 'USER_INACTIVE',
        message: 'Account is inactive. Please contact admin.',
        traceId: req.requestId,
      });
    }

    const now = Date.now();
    if (user.lockUntil && user.lockUntil > now) {
      logInfo('auth_login_locked', {
        reqId: req.requestId,
        userId: user.userId,
        lockUntil: user.lockUntil,
      });
      return res.status(423).json({
        error: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Please try again later.',
        lockUntil: user.lockUntil,
        traceId: req.requestId,
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await userRepository.recordFailedLogin(user.userId, MAX_LOGIN_ATTEMPTS, LOCK_WINDOW_MS);
      logInfo('auth_login_bad_password', { reqId: req.requestId, userId: user.userId });
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        traceId: req.requestId,
      });
    }

    await userRepository.clearFailedLogins(user.userId);

    const pair = buildTokenPair(user.userId, user.role);

    await refreshTokenRepository.create({
      userId: user.userId,
      jti: pair.refresh.jti,
      expiresAt: pair.refresh.exp * 1000,
    });

    setRefreshCookie(res, pair.refresh.token);

    const response: LoginResponse = {
      userId: user.userId,
      role: user.role,
      tokens: {
        accessToken: pair.access.token,
        expiresInSec: env.ACCESS_TOKEN_TTL_SEC,
      },
    };

    logAudit({
      actorUserId: user.userId,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: { type: 'USER', id: user.userId },
      meta: { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
    });

    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
});

r.post('/refresh', async (req, res, next) => {
  try {
    const env = getEnv();

    const body = RefreshRequest.safeParse(req.body);
    const bodyToken = body.success ? body.data.refreshToken : undefined;

    const cookieToken = (req.cookies?.[COOKIE_NAME] as string | undefined) ?? undefined;
    const refreshToken = cookieToken ?? bodyToken;

    if (!refreshToken) {
      clearRefreshCookie(res);
      throw new AuthError('Missing refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    let decoded: RefreshTokenClaims;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      clearRefreshCookie(res);
      throw new AuthError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    const record = await refreshTokenRepository.consume({ userId: decoded.sub, jti: decoded.jti });
    if (!record) {
      clearRefreshCookie(res);
      throw new AuthError('Refresh token expired or already used', 401, 'INVALID_REFRESH_TOKEN');
    }

    const user = await userRepository.getById(decoded.sub);
    if (!user) {
      clearRefreshCookie(res);
      throw new AuthError('User not found', 401, 'INVALID_REFRESH_TOKEN');
    }

    if (user.active === false) {
      clearRefreshCookie(res);
      throw new AuthError('User inactive', 403, 'USER_INACTIVE');
    }

    const pair = buildTokenPair(user.userId, user.role);

    await refreshTokenRepository.create({
      userId: user.userId,
      jti: pair.refresh.jti,
      expiresAt: pair.refresh.exp * 1000,
    });

    setRefreshCookie(res, pair.refresh.token);

    const response: RefreshResponse = {
      userId: user.userId,
      role: user.role,
      tokens: {
        accessToken: pair.access.token,
        expiresInSec: env.ACCESS_TOKEN_TTL_SEC,
      },
    };

    logAudit({
      actorUserId: user.userId,
      action: 'AUTH_REFRESH_SUCCESS',
      entity: { type: 'USER', id: user.userId },
      meta: { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
    });

    return res.status(200).json(response);
  } catch (err) {
    return next(err);
  }
});

r.post('/logout', async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.[COOKIE_NAME] as string | undefined;

    if (cookieToken) {
      try {
        const decoded = verifyRefreshToken(cookieToken);
        await refreshTokenRepository.consume({ userId: decoded.sub, jti: decoded.jti });
      } catch {
        // ignore
      }
    }

    clearRefreshCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default r;
