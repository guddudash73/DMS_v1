import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';

const app = createApp();

describe('Patients API', () => {
  it('creates and fatches a patient', async () => {
    const createRes = await request(app)
      .post('/patients')
      .send({
        name: 'Guddu Dash',
        dob: '2001-03-23',
        gender: 'male',
        phone: '+917749064894',
      })
      .expect(201);

    expect(createRes.body).toHaveProperty('patientId');
    const patientId = createRes.body.patientId as string;

    const getRes = await request(app).get(`/patients/${patientId}`).expect(200);

    expect(getRes.body.patientId).toBe(patientId);
    expect(getRes.body.name).toBe('Guddu Dash');
  });

  it('rejects invalid input', async () => {
    const res = await request(app)
      .post('/patients')
      .send({
        name: '',
      })
      .expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
