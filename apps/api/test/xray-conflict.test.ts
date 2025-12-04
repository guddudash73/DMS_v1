import { afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { asDoctor, asReception } from './helpers/auth';
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

const makePhone = () =>
  `+917000${Math.floor(Math.random() * 100_000)
    .toString()
    .padStart(5, '0')}`;

async function createPatient() {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name: 'Xray Conflict Patient',
      dob: '1992-03-03',
      gender: 'male',
      phone: makePhone(),
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
      doctorId: 'DOCTOR#XRAY_CONFLICT',
      reason: 'X-ray conflict test',
    })
    .expect(201);

  return res.body as { visitId: string; visitDate: string; patientId: string };
}

describe('X-ray metadata conflict (XRAY_CONFLICT)', () => {
  it('returns 409 XRAY_CONFLICT on duplicate xrayId for the same visit', async () => {
    const patientId = await createPatient();
    const visit = await createVisit(patientId);

    const xrayId = `test-xray-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const takenAt = 1730000000000;

    const firstRes = await request(app)
      .post(`/visits/${visit.visitId}/xrays`)
      .set('Authorization', asDoctor())
      .send({
        xrayId,
        contentType: 'image/jpeg',
        size: 2048,
        takenAt,
        takenByUserId: 'DOCTOR#XRAY_CONFLICT',
      })
      .expect(201);

    expect(firstRes.body.xrayId).toBe(xrayId);
    expect(firstRes.body.visitId).toBe(visit.visitId);

    const secondRes = await request(app)
      .post(`/visits/${visit.visitId}/xrays`)
      .set('Authorization', asDoctor())
      .send({
        xrayId,
        contentType: 'image/jpeg',
        size: 2048,
        takenAt,
        takenByUserId: 'DOCTOR#XRAY_CONFLICT',
      });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.error).toBe('XRAY_CONFLICT');
    expect(typeof secondRes.body.message).toBe('string');
  });
});
