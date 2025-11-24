import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';

const app = createApp();

const hasFetch = typeof (globalThis as any).fetch === 'function';

(hasFetch ? describe : describe.skip)('X-ray S3 flow (LocalStack)', () => {
  async function createPatient(name: string, phone: string) {
    const res = await request(app)
      .post('/patients')
      .send({
        name,
        dob: '1990-01-01',
        gender: 'female',
        phone,
      })
      .expect(201);

    return res.body.patientId as string;
  }

  async function createVisit(patientId: string, doctorId: string, reason: string) {
    const res = await request(app)
      .post('/visits')
      .send({
        patientId,
        doctorId,
        reason,
      })
      .expect(201);

    return res.body as { visitId: string; visitDate: string; patientId: string };
  }

  it('POST /xrays/presign → PUT object → POST /visits/:visitId/xrays → GET /xrays/:id/url', async () => {
    const patientId = await createPatient('X-ray Flow Patient', '+910000000301');
    const visit = await createVisit(patientId, 'DOCTOR#XRAY_FLOW', 'X-ray flow test');

    const presignRes = await request(app)
      .post('/xrays/presign')
      .send({
        visitId: visit.visitId,
        contentType: 'image/jpeg',
        size: 2048,
      })
      .expect(201);

    const { xrayId, uploadUrl } = presignRes.body as {
      xrayId: string;
      uploadUrl: string;
    };

    expect(typeof xrayId).toBe('string');
    expect(typeof uploadUrl).toBe('string');
    expect(uploadUrl.length).toBeGreaterThan(0);

    const fetchFn: any = (globalThis as any).fetch;
    const putRes = await fetchFn(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
      },
      body: Buffer.from('fake-jpeg-bytes'),
    });

    expect(putRes.ok).toBe(true);

    const takenAt = Date.now();
    const metaRes = await request(app)
      .post(`/visits/${visit.visitId}/xrays`)
      .send({
        xrayId,
        contentType: 'image/jpeg',
        size: 2048,
        takenAt,
        takenByUserId: 'DOCTOR#XRAY_FLOW',
      })
      .expect(201);

    expect(metaRes.body.xrayId).toBe(xrayId);
    expect(metaRes.body.visitId).toBe(visit.visitId);

    const urlRes = await request(app).get(`/xrays/${xrayId}/url`).expect(200);

    expect(urlRes.body.variant).toBe('original');
    expect(typeof urlRes.body.url).toBe('string');
    expect(urlRes.body.url.length).toBeGreaterThan(0);
  });
});
