import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { warmAuth, asDoctor, asReception } from './helpers/auth';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

const createdPatients: string[] = [];
const registerPatient = (id: string) => {
  createdPatients.push(id);
};

beforeAll(async () => {
  await warmAuth();
});

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;

  for (const id of ids) {
    await deletePatientCompletely(id);
  }
});

async function createPatient(name: string, phoneSuffix: string) {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name,
      dob: '1990-01-01',
      gender: 'female',
      phone: `+91000000${phoneSuffix}`,
    })
    .expect(201);

  const patientId = res.body.patientId as string;
  registerPatient(patientId);
  return patientId;
}

async function createVisit(patientId: string, doctorId: string, reason: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', asReception())
    .send({ patientId, doctorId, reason })
    .expect(201);

  return (res.body.visit ?? res.body) as { visitId: string; visitDate: string; patientId: string };
}

const runId = Date.now();

describe('Doctor queue concurrency – DOCTOR_DAY lock', () => {
  it('allows multiple IN_PROGRESS visits for same doctor/day (no lock enforced in backend)', async () => {
    const doctorId = `DOCTOR#QUEUE_CONCURRENCY#${runId}`;

    const p1 = await createPatient('Concurrency Patient 1', '401');
    const v1 = await createVisit(p1, doctorId, 'First concurrent visit');

    const p2 = await createPatient('Concurrency Patient 2', '402');
    const v2 = await createVisit(p2, doctorId, 'Second concurrent visit');

    const takeSeat1 = await request(app)
      .post('/visits/queue/take-seat')
      .set('Authorization', asDoctor())
      .send({ visitId: v1.visitId })
      .expect(200);

    expect(takeSeat1.body.visitId).toBe(v1.visitId);
    expect(takeSeat1.body.status).toBe('IN_PROGRESS');
    const takeSeat2 = await request(app)
      .post('/visits/queue/take-seat')
      .set('Authorization', asDoctor())
      .send({ visitId: v2.visitId })
      .expect(200);

    expect(takeSeat2.body.visitId).toBe(v2.visitId);
    expect(takeSeat2.body.status).toBe('IN_PROGRESS');
    const doneRes = await request(app)
      .patch(`/visits/${v1.visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'DONE' })
      .expect(200);

    expect(doneRes.body.visitId).toBe(v1.visitId);
    expect(doneRes.body.status).toBe('DONE');
    const v2Get = await request(app)
      .get(`/visits/${v2.visitId}`)
      .set('Authorization', asReception())
      .expect(200);

    expect(v2Get.body.visitId).toBe(v2.visitId);
    expect(v2Get.body.status).toBe('IN_PROGRESS');
  });
});
