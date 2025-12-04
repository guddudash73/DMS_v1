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

async function createPatient(name: string, phone: string) {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name,
      phone,
      dob: '1990-01-01',
      gender: 'male',
    })
    .expect(201);

  const patientId = res.body.patientId as string;
  registerPatient(patientId);
  return { patientId, body: res.body };
}

describe('Patients – phone+name uniqueness', () => {
  it('allows same phone with different names but rejects same phone+same name', async () => {
    const phoneFmt1 = '+91 7749 123 456';
    const { patientId: p1Id } = await createPatient('Phone Test User', phoneFmt1);

    expect(p1Id).toBeDefined();

    const phoneFmt2 = '07749-123-456';
    const res2 = await request(app)
      .post('/patients')
      .set('Authorization', asReception())
      .send({
        name: 'Duplicate Phone User',
        phone: phoneFmt2,
        dob: '1991-02-02',
        gender: 'female',
      })
      .expect(201);

    const p2Id = res2.body.patientId as string;
    registerPatient(p2Id);
    expect(p2Id).toBeDefined();

    const res3 = await request(app).post('/patients').set('Authorization', asReception()).send({
      name: 'Phone Test User',
      phone: '07749123456',
      dob: '1992-03-03',
      gender: 'male',
    });

    expect(res3.status).toBe(409);
    expect(res3.body.error).toBe('DUPLICATE_PATIENT');

    expect(typeof res3.body.message).toBe('string');
  });

  it('enforces (phone+name) uniqueness on PATCH as well', async () => {
    const { patientId: aId } = await createPatient('Patient A', '+91 9999 111 222');

    const { patientId: bId } = await createPatient('Patient B', '+91 8888 111 222');

    const res1 = await request(app)
      .patch(`/patients/${bId}`)
      .set('Authorization', asReception())
      .send({
        phone: '09999111222',
      })
      .expect(200);

    expect(res1.body.patientId).toBe(bId);
    expect(res1.body.name).toBe('Patient B');

    const res2 = await request(app)
      .patch(`/patients/${bId}`)
      .set('Authorization', asReception())
      .send({
        name: 'Patient A',
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBe('DUPLICATE_PATIENT');
  });
});
