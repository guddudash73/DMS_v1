import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { asDoctor, asReception } from './helpers/auth';

const app = createApp();

async function createPatient() {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name: 'Queue Test Patient',
      dob: '1995-01-01',
      gender: 'female',
      phone: '+910000000000',
    })
    .expect(201);

  return res.body.patientId as string;
}

describe('Visits API', () => {
  it('creates a visits and retrieves it and patients visits list', async () => {
    const patientId = await createPatient();

    const createVisitRes = await request(app)
      .post('/visits')
      .set('Authorization', asReception())
      .send({
        patientId,
        doctorId: 'DOCTOR#001',
        reason: 'Routine checkup',
      })
      .expect(201);

    expect(createVisitRes.body).toHaveProperty('visitId');
    const visitId = createVisitRes.body.visitId as string;

    const getRes = await request(app)
      .get(`/visits/${visitId}`)
      .set('Authorization', asReception())
      .expect(200);
    expect(getRes.body.visitId).toBe(visitId);
    expect(getRes.body.patientId).toBe(patientId);
    expect(getRes.body.status).toBe('QUEUED');

    const listRes = await request(app)
      .get(`/patients/${patientId}/visits`)
      .set('Authorization', asReception())
      .expect(200);

    expect(Array.isArray(listRes.body.items)).toBe(true);
    const found = listRes.body.items.find((v: any) => v.visitId === visitId);
    expect(found).toBeDefined();
  });

  it('enforces valid status transition and rejects invalid ones', async () => {
    const patientId = await createPatient();

    const createVisitRes = await request(app)
      .post('/visits')
      .set('Authorization', asReception())
      .send({
        patientId,
        doctorId: 'DOCTOR#002',
        reason: 'Tooth_pain',
      })
      .expect(201);

    const visitId = createVisitRes.body.visitId as string;

    const inProgressRes = await request(app)
      .patch(`/visits/${visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    expect(inProgressRes.body.status).toBe('IN_PROGRESS');

    const doneRes = await request(app)
      .patch(`/visits/${visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'DONE' })
      .expect(200);

    expect(doneRes.body.status).toBe('DONE');

    const invalidRes = await request(app)
      .patch(`/visits/${visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'IN_PROGRESS' })
      .expect(409);

    expect(invalidRes.body.error).toBe('INVALID_STATUS_TRANSITION');
  });

  it('returns 404 for missing visit id', async () => {
    await request(app)
      .get('/visits/non-existing-id')
      .set('Authorization', asReception())
      .expect(404);
  });

  it('returns doctor queue for a given date and doctor', async () => {
    const patientId = await createPatient();

    const createVisitRes = await request(app)
      .post('/visits')
      .set('Authorization', asReception())
      .send({
        patientId,
        doctorId: 'DOCTOR#003',
        reason: 'Cleaning',
      })
      .expect(201);

    const visitId = createVisitRes.body.visitId as string;
    const visitDate = createVisitRes.body.visitDate as string;

    const queueRes = await request(app)
      .get('/visits/queue')
      .set('Authorization', asDoctor())
      .query({ doctorId: 'DOCTOR#003', date: visitDate })
      .expect(200);

    expect(Array.isArray(queueRes.body.items)).toBe(true);
    const found = queueRes.body.items.find((v: any) => v.visitId === visitId);
    expect(found).toBeDefined();
  });
});
