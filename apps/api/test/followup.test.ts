// apps/api/test/followup.test.ts
import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { warmAuth, asReception } from './helpers/auth';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

let receptionAuthHeader: string;

const createdPatients: string[] = [];
const registerPatient = (id: string) => createdPatients.push(id);

beforeAll(async () => {
  await warmAuth();
  receptionAuthHeader = asReception(); // already "Bearer <token>"
});

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;
  for (const id of ids) await deletePatientCompletely(id);
});

async function createPatient() {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', receptionAuthHeader)
    .send({
      name: 'Followup Test Patient',
      dob: '1995-01-01',
      gender: 'female',
      phone: `+910000000${Math.floor(Math.random() * 1_000)
        .toString()
        .padStart(3, '0')}`,
    })
    .expect(201);

  const patientId = res.body.patientId as string;
  registerPatient(patientId);
  return patientId;
}

async function createVisit(patientId: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', receptionAuthHeader)
    .send({
      patientId,
      doctorId: 'DOCTOR#FOLLOWUP',
      reason: 'Follow-up test',
    })
    .expect(201);

  // backend returns { visit, tokenPrint }
  const visit = (res.body.visit ?? res.body) as { visitId: string; visitDate: string };

  return { visitId: visit.visitId, visitDate: visit.visitDate, patientId };
}

const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('Follow-up API (multi followups)', () => {
  it('creates an ACTIVE follow-up for a visit with valid date (POST /visits/:visitId/followups)', async () => {
    const patientId = await createPatient();
    const { visitId } = await createVisit(patientId);

    const followUpDate = plusDays(1);

    const res = await request(app)
      .post(`/visits/${visitId}/followups`)
      .set('Authorization', receptionAuthHeader)
      .send({
        followUpDate,
        reason: 'Call patient tomorrow',
        contactMethod: 'CALL',
      })
      .expect(201);

    expect(res.body.visitId).toBe(visitId);
    expect(res.body.followUpDate).toBe(followUpDate);
    expect(res.body.status).toBe('ACTIVE');
    expect(typeof res.body.followupId).toBe('string');

    const listRes = await request(app)
      .get(`/visits/${visitId}/followups`)
      .set('Authorization', receptionAuthHeader)
      .expect(200);

    expect(Array.isArray(listRes.body.items)).toBe(true);
    const found = (listRes.body.items as any[]).find((x) => x.followupId === res.body.followupId);
    expect(found).toBeTruthy();
    expect(found.followUpDate).toBe(followUpDate);
    expect(found.status).toBe('ACTIVE');
  });

  it('rejects follow-up when followUpDate is before visitDate', async () => {
    const patientId = await createPatient();
    const { visitId } = await createVisit(patientId);

    const earlierDate = '2000-01-01';

    const res = await request(app)
      .post(`/visits/${visitId}/followups`)
      .set('Authorization', receptionAuthHeader)
      .send({
        followUpDate: earlierDate,
        reason: 'Invalid past follow-up',
      })
      .expect(400);

    expect(res.body.error).toBe('FOLLOWUP_RULE_VIOLATION');
    expect(String(res.body.message ?? '')).toContain('cannot be before visitDate');
  });

  it('updates follow-up status to COMPLETED and daily includes it', async () => {
    const patientId = await createPatient();
    const { visitId } = await createVisit(patientId);

    const followUpDate = plusDays(2);

    const createRes = await request(app)
      .post(`/visits/${visitId}/followups`)
      .set('Authorization', receptionAuthHeader)
      .send({
        followUpDate,
        reason: 'Check healing',
        contactMethod: 'CALL',
      })
      .expect(201);

    const followupId = createRes.body.followupId as string;

    const patchRes = await request(app)
      .patch(`/visits/${visitId}/followups/${followupId}/status`)
      .set('Authorization', receptionAuthHeader)
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(patchRes.body.status).toBe('COMPLETED');
    expect(patchRes.body.followupId).toBe(followupId);

    const dailyRes = await request(app)
      .get('/followups/daily')
      .query({ date: followUpDate })
      .set('Authorization', receptionAuthHeader)
      .expect(200);

    expect(Array.isArray(dailyRes.body.items)).toBe(true);

    const dailyItem = (dailyRes.body.items as any[]).find((x) => x.followupId === followupId);
    expect(dailyItem).toBeTruthy();
    expect(dailyItem.status).toBe('COMPLETED');
    expect(dailyItem.followUpDate).toBe(followUpDate);
  });
});
