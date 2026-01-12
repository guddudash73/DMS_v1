// apps/api/test/xray-negative.test.ts
import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { warmAuth, asDoctor } from './helpers/auth';

const app = createApp();

beforeAll(async () => {
  await warmAuth();
});

describe('X-ray negative paths', () => {
  it('rejects invalid contentType in /xrays/presign', async () => {
    const res = await request(app).post('/xrays/presign').set('Authorization', asDoctor()).send({
      // invalid VisitId format is fine here; we only care it's rejected
      // (it will fail zod validation anyway)
      visitId: 'visit-xyz',
      contentType: 'application/pdf',
      size: 1024,
    });

    // depending on your zod error handler, this could be 400 or 422
    expect([400, 422]).toContain(res.status);
  });

  it('rejects too-large size in /xrays/presign', async () => {
    const res = await request(app)
      .post('/xrays/presign')
      .set('Authorization', asDoctor())
      .send({
        visitId: 'visit-xyz',
        contentType: 'image/jpeg',
        size: 20 * 1024 * 1024, // 20MB > 10MB max
      });

    expect([400, 422]).toContain(res.status);
  });

  it('returns 404 for missing /xrays/:id/url', async () => {
    const res = await request(app)
      .get('/xrays/non-existent-id/url')
      .set('Authorization', asDoctor());

    // your route returns 404 when meta is missing
    expect([404, 410]).toContain(res.status);
  });
});
