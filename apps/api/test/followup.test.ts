import { afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { asReception } from './helpers/auth';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

const createdPatients: string[] = [];
const registerPatient = (id: string) => {
  createdPatients.push(id);
};

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;

  for (const id of ids) {
    await deletePatientCompletely(id);
  }
});

async function createPatient() {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
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
    .set('Authorization', asReception())
    .send({
      patientId,
      doctorId: 'DOCTOR#FOLLOWUP',
      reason: 'Follow-up test',
    })
    .expect(201);

  // visits.create returns { visit, tokenPrint } in your current routes/visits.ts
  const visitId = (res.body.visit?.visitId ?? res.body.visitId) as string;
  const visitDate = (res.body.visit?.visitDate ?? res.body.visitDate) as string;

  return { visitId, visitDate, patientId };
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
      .set('Authorization', asReception())
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
    expect(res.body.followupId.length).toBeGreaterThan(5);

    // list by visit
    const listRes = await request(app)
      .get(`/visits/${visitId}/followups`)
      .set('Authorization', asReception())
      .expect(200);

    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items.length).toBeGreaterThanOrEqual(1);

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
      .set('Authorization', asReception())
      .send({
        followUpDate: earlierDate,
        reason: 'Invalid past follow-up',
      })
      .expect(400);

    expect(res.body.error).toBe('FOLLOWUP_RULE_VIOLATION');
    expect(String(res.body.message ?? '')).toContain('cannot be before visitDate');
  });

  it('updates follow-up status to COMPLETED (PATCH /visits/:visitId/followups/:followupId/status) and daily includes it', async () => {
    const patientId = await createPatient();
    const { visitId } = await createVisit(patientId);

    const followUpDate = plusDays(2);

    const createRes = await request(app)
      .post(`/visits/${visitId}/followups`)
      .set('Authorization', asReception())
      .send({
        followUpDate,
        reason: 'Check healing',
        contactMethod: 'CALL',
      })
      .expect(201);

    const followupId = createRes.body.followupId as string;

    const patchRes = await request(app)
      .patch(`/visits/${visitId}/followups/${followupId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(patchRes.body.status).toBe('COMPLETED');
    expect(patchRes.body.followupId).toBe(followupId);

    // ✅ now /followups/daily must include COMPLETED (non-active)
    const dailyRes = await request(app)
      .get(`/followups/daily`)
      .query({ date: followUpDate })
      .set('Authorization', asReception())
      .expect(200);

    expect(Array.isArray(dailyRes.body.items)).toBe(true);

    const dailyItem = (dailyRes.body.items as any[]).find((x) => x.followupId === followupId);
    expect(dailyItem).toBeTruthy();
    expect(dailyItem.status).toBe('COMPLETED');
    expect(dailyItem.followUpDate).toBe(followUpDate);
  });
});
