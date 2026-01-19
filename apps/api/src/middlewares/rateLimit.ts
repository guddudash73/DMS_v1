import type { Request, Response, NextFunction } from 'express';
import { logInfo } from '../lib/logger';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request) => void;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export const createRateLimiter = (options: RateLimitOptions) => {
  const { windowMs, max, keyGenerator = (req) => req.ip || 'unknown', onLimitReached } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count < max) {
      bucket.count += 1;
      return next();
    }

    if (onLimitReached) {
      try {
        onLimitReached(req);
      } catch {
        // Ignore
      }
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.header('Retry-After', retryAfterSeconds.toString());
    res.header('RateLimit-Limit', String(max));
    res.header('RateLimit-Remaining', '0');
    res.header('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again later.',
    });
  };
};

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => {
    const ip = req.ip || 'unknown';
    return `login-ip:${ip}`;
  },
  onLimitReached: (req) => {
    logInfo('auth_login_rate_limited', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
  },
});

export const genericSensitiveRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    const ip = req.ip || 'unknown';
    return `sensitive:${ip}:${req.path}`;
  },
  onLimitReached: (req) => {
    logInfo('api_sensitive_rate_limited', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
  },
});

export const refreshRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => {
    const ip = req.ip || 'unknown';
    return `refresh-ip:${ip}`;
  },
  onLimitReached: (req) => {
    logInfo('auth_refresh_rate_limited', { ip: req.ip, path: req.path, method: req.method });
  },
});

export const logoutRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    const ip = req.ip || 'unknown';
    return `logout-ip:${ip}`;
  },
});
