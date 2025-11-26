import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { asReception } from './helpers/auth';

const app = createApp();

async function createPatient() {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name: 'Followup Test Patient',
      dob: '1995-01-01',
      gender: 'female',
      phone: '+910000000111',
    })
    .expect(201);

  return res.body.patientId as string;
}

async function createVisit(patientId: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', asReception())
    .send({
      patientId,
      doctorId: 'DOCTOR#FOLLOWUP',
      reason: 'Follow-up test',
    })
    .expect(201);

  return res.body as { visitId: string; visitDate: string; patientId: string };
}

const todayString = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('Follow-up API', () => {
  it('creates an ACTIVE follow-up for a visit with valid date', async () => {
    const patientId = await createPatient();
    const { visitId } = await createVisit(patientId);

    const followUpDate = plusDays(1);

    const res = await request(app)
      .put(`/visits/${visitId}/followup`)
      .set('Authorization', asReception())
      .send({
        followUpDate,
        reason: 'Call patient tomorrow',
        contactMethod: 'CALL',
      })
      .expect(200);

    expect(res.body.visitId).toBe(visitId);
    expect(res.body.followUpDate).toBe(followUpDate);
    expect(res.body.status).toBe('ACTIVE');

    const getRes = await request(app)
      .get(`/visits/${visitId}/followup`)
      .set('Authorization', asReception())
      .expect(200);
    expect(getRes.body.followUpDate).toBe(followUpDate);
    expect(getRes.body.status).toBe('ACTIVE');
  });

  it('rejects follow-up when followUpDate is before visitDate', async () => {
    const patientId = await createPatient();
    const { visitId, visitDate } = await createVisit(patientId);

    const earlierDate = '2000-01-01';

    const res = await request(app)
      .put(`/visits/${visitId}/followup`)
      .set('Authorization', asReception())
      .send({
        followUpDate: earlierDate,
        reason: 'Invalid past follow-up',
      })
      .expect(400);

    expect(res.body.error).toBe('FOLLOWUP_RULE_VIOLATION');
    expect(res.body.message).toContain('cannot be before visitDate');
    expect(visitDate >= todayString()).toBe(true);
  });

  it('updates follow-up status to COMPLETED', async () => {
    const patientId = await createPatient();
    const { visitId } = await createVisit(patientId);

    const followUpDate = plusDays(2);

    await request(app)
      .put(`/visits/${visitId}/followup`)
      .set('Authorization', asReception())
      .send({
        followUpDate,
        reason: 'Check healing',
      })
      .expect(200);

    const res = await request(app)
      .patch(`/visits/${visitId}/followup/status`)
      .set('Authorization', asReception())
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(res.body.status).toBe('COMPLETED');
  });
});
