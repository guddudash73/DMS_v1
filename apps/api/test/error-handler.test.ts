import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { errorHandler } from '../src/middlewares/errorHandler';
import { validate } from '../src/middlewares/zod';
import { AuthError } from '../src/middlewares/auth';

describe('errorHandler', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());

    const LoginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    app.post('/test/zod', validate(LoginSchema), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    app.get('/test/auth', (_req, _res, next) => {
      next(new AuthError('Missing auth context'));
    });

    app.get('/test/domain', (_req, _res, next) => {
      const err = new Error('Too many foos') as Error & { code?: string; statusCode?: number };
      err.code = 'FOO_LIMIT_EXCEEDED';
      err.statusCode = 429;
      next(err);
    });

    app.get('/test/generic', (_req, _res, next) => {
      next(new Error('Boom'));
    });

    app.use(errorHandler);

    return app;
  };

  it('formats Zod validation errors as VALIDATION_ERROR', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/test/zod')
      .send({ email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Request validation failed');
    expect(res.body.fieldErrors).toBeDefined();
  });

  it('formats AuthError with its code and status', async () => {
    const app = buildApp();

    const res = await request(app).get('/test/auth').send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    expect(res.body.message).toBe('Missing auth context');
  });

  it('formats domain errors with code/statusCode', async () => {
    const app = buildApp();

    const res = await request(app).get('/test/domain').send();

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('FOO_LIMIT_EXCEEDED');
    expect(res.body.message).toBe('Too many foos');
  });

  it('handles generic errors as INTERNAL_SERVER_ERROR', async () => {
    const app = buildApp();

    const res = await request(app).get('/test/generic').send();

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.message).toBe('Unexpected error');
  });
});
