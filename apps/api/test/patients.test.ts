import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { asReception } from './helpers/auth';

const app = createApp();

describe('Patients API', () => {
  it('creates and fatches a patient', async () => {
    const createRes = await request(app)
      .post('/patients')
      .set('Authorization', asReception())
      .send({
        name: 'Guddu Dash',
        dob: '2001-03-23',
        gender: 'male',
        phone: '+917749064894',
      })
      .expect(201);

    expect(createRes.body).toHaveProperty('patientId');
    const patientId = createRes.body.patientId as string;

    const getRes = await request(app)
      .get(`/patients/${patientId}`)
      .set('Authorization', asReception())
      .expect(200);

    expect(getRes.body.patientId).toBe(patientId);
    expect(getRes.body.name).toBe('Guddu Dash');
  });

  it('rejects invalid input', async () => {
    const res = await request(app)
      .post('/patients')
      .set('Authorization', asReception())
      .send({
        name: '',
      })
      .expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('searches patient by phone using GET /patients?query=', async () => {
    const phone = '+919876543210';
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
