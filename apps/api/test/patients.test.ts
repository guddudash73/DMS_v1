import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { warmAuth, asReception } from './helpers/auth';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

const createdPatients: string[] = [];
const registerPatient = (id: string) => createdPatients.push(id);

beforeAll(async () => {
  await warmAuth();
});

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;
  for (const id of ids) await deletePatientCompletely(id);
});

describe('Patients API', () => {
  it('creates and fatches a patient', async () => {
    const createRes = await request(app)
      .post('/patients')
      .set('Authorization', asReception())
      .send({
        name: 'Guddu Dash',
        dob: '2001-03-23',
        gender: 'male',
        phone: `+9177490648${Math.floor(Math.random() * 100)
          .toString()
          .padStart(2, '0')}`,
        address: 'Some address line',
      })
      .expect(201);

    expect(createRes.body).toHaveProperty('patientId');
    expect(createRes.body).toHaveProperty('sdId');
    expect(typeof createRes.body.sdId).toBe('string');
    expect(createRes.body.sdId).toMatch(/^SD-\d{4}-\d{5}$/);

    const patientId = createRes.body.patientId as string;
    registerPatient(patientId);

    const getRes = await request(app)
      .get(`/patients/${patientId}`)
      .set('Authorization', asReception())
      .expect(200);

    expect(getRes.body.patientId).toBe(patientId);
    expect(getRes.body.name).toBe('Guddu Dash');
    expect(getRes.body.sdId).toBe(createRes.body.sdId);
  });

  it('rejects invalid input', async () => {
    const res = await request(app)
      .post('/patients')
      .set('Authorization', asReception())
      .send({ name: '' })
      .expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('searches patient by phone using GET /patients?query=', async () => {
    const phoneBase = '+9198765432';
    const phone = `${phoneBase}${Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, '0')}`;
    const digitsOnly = phone.replace(/\D/g, '');

    const createRes = await request(app)
      .post('/patients')
      .set('Authorization', asReception())
      .send({
        name: 'Phone Search Patient',
        dob: '2001-02-23',
        gender: 'male',
        phone,
      })
      .expect(201);

    const patientId = createRes.body.patientId as string;
    registerPatient(patientId);

    const searchRes = await request(app)
      .get('/patients')
      .set('Authorization', asReception())
      .query({ query: digitsOnly })
      .expect(200);

    expect(Array.isArray(searchRes.body.items)).toBe(true);

    const found = searchRes.body.items.find((p: any) => p.patientId === patientId);
    expect(found).toBeDefined();
    expect(found.phone).toBe(phone);
    expect(found.name).toBe('Phone Search Patient');
  });
});
