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
      visitId: 'visit-xyz',
      contentType: 'application/pdf',
      size: 1024,
    });
    expect([400, 422]).toContain(res.status);
  });

  it('rejects too-large size in /xrays/presign', async () => {
    const res = await request(app)
      .post('/xrays/presign')
      .set('Authorization', asDoctor())
      .send({
        visitId: 'visit-xyz',
        contentType: 'image/jpeg',
        size: 20 * 1024 * 1024,
      });

    expect([400, 422]).toContain(res.status);
  });

  it('returns 404 for missing /xrays/:id/url', async () => {
    const res = await request(app)
      .get('/xrays/non-existent-id/url')
      .set('Authorization', asDoctor());

    expect([404, 410]).toContain(res.status);
  });
});
