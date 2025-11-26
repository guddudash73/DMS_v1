import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/server';
import { userRepository } from '../src/repositories/userRepository';

const app = createApp();

type Role = 'RECEPTION' | 'DOCTOR' | 'ADMIN';

const mkUser = async (role: Role) => {
  // Make email unique per run so DynamoDB conditional checks never collide
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `${role.toLowerCase()}-auth-roles-${suffix}@example.com`;
  const password = `${role}Pass123!`;
  const hash = await bcrypt.hash(password, 10);

  await userRepository.createUser({
    email,
    displayName: `${role} Auth Roles User ${suffix}`,
    passwordHash: hash,
    role,
  });

  const login = await request(app).post('/auth/login').send({ email, password }).expect(200);

  return login.body.tokens.accessToken as string;
};

let receptionToken: string;
let doctorToken: string;
let adminToken: string;

beforeAll(async () => {
  [receptionToken, doctorToken, adminToken] = await Promise.all([
    mkUser('RECEPTION'),
    mkUser('DOCTOR'),
    mkUser('ADMIN'),
  ]);
});

async function createPatient(token: string) {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Auth Roles Patient',
      dob: '1990-01-01',
      gender: 'female',
      phone: `+9100${Math.floor(Math.random() * 1_000_000_000)
        .toString()
        .padStart(9, '0')}`,
    })
    .expect(201);

  return res.body.patientId as string;
}

async function createVisit(token: string, patientId: string, doctorId: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', `Bearer ${token}`)
    .send({
      patientId,
      doctorId,
      reason: 'Auth roles test visit',
    })
    .expect(201);

  return res.body.visitId as string;
}

describe('Auth roles', () => {
  it('allows RECEPTION to access /patients and /visits but not /rx or /reports', async () => {
    // /patients should be accessible (status 200 or 400 based on validation, but not 401/403)
    const patientsRes = await request(app)
      .get('/patients')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ query: 'test', limit: '5' });

    expect([200, 400]).toContain(patientsRes.status);

    // /visits (queue) should be accessible (again, 200/400 but not 401/403)
    const visitsRes = await request(app)
      .get('/visits/queue')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ doctorId: 'DOCTOR#AUTH_ROLES', date: '2030-01-01' });

    expect([200, 400]).toContain(visitsRes.status);

    // /rx routes should be forbidden for RECEPTION
    const rxRes = await request(app)
      .get('/rx/some-id/json-url')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(rxRes.status).toBe(403);
    expect(rxRes.body.error).toBe('FORBIDDEN');

    // /reports should be forbidden for RECEPTION
    const reportsRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ date: '2030-01-01' });

    expect(reportsRes.status).toBe(403);
    expect(reportsRes.body.error).toBe('FORBIDDEN');
  });

  it('allows DOCTOR to access /visits, /rx, /medicines, /xrays but not /admin routes', async () => {
    // /visits (queue) allowed
    const visitsRes = await request(app)
      .get('/visits/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ doctorId: 'DOCTOR#AUTH_ROLES', date: '2030-01-01' });

    expect([200, 400]).toContain(visitsRes.status);

    // /rx allowed (we just expect not auth failure; route may return 404)
    const rxRes = await request(app)
      .get('/rx/non-existing-id/json-url')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect([200, 400, 404]).toContain(rxRes.status);
    expect(rxRes.status).not.toBe(401);
    expect(rxRes.status).not.toBe(403);

    // /medicines allowed
    const medsRes = await request(app)
      .get('/medicines')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ query: 'test', limit: '5' });

    expect([200, 400]).toContain(medsRes.status);
    expect(medsRes.status).not.toBe(401);
    expect(medsRes.status).not.toBe(403);

    // /xrays allowed (again, 404 is fine, just not 401/403)
    const xrayRes = await request(app)
      .get('/xrays/non-existing-id/url')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect([200, 400, 404]).toContain(xrayRes.status);
    expect(xrayRes.status).not.toBe(401);
    expect(xrayRes.status).not.toBe(403);

    // /admin routes should be forbidden for DOCTOR
    const adminDoctorsRes = await request(app)
      .get('/admin/doctors')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(adminDoctorsRes.status).toBe(403);
    expect(adminDoctorsRes.body.error).toBe('FORBIDDEN');

    const adminRxPresetsRes = await request(app)
      .get('/admin/rx-presets')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(adminRxPresetsRes.status).toBe(403);
    expect(adminRxPresetsRes.body.error).toBe('FORBIDDEN');
  });

  it('restricts POST /visits/:visitId/rx to DOCTOR/ADMIN', async () => {
    // Create patient + visit (reception can create)
    const patientId = await createPatient(receptionToken);
    const visitId = await createVisit(receptionToken, patientId, 'DOCTOR#AUTH_RX');

    // DOCTOR can create Rx
    const okRes = await request(app)
      .post(`/visits/${visitId}/rx`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        lines: [
          {
            medicine: 'Paracetamol 500mg',
            dose: '500mg',
            frequency: 'TID',
            duration: 3,
          },
        ],
      });

    expect(okRes.status).toBe(201);
    expect(okRes.body.visitId).toBe(visitId);

    // RECEPTION cannot create Rx
    const forbiddenRes = await request(app)
      .post(`/visits/${visitId}/rx`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({
        lines: [
          {
            medicine: 'Ibuprofen 400mg',
            dose: '400mg',
            frequency: 'TID',
            duration: 3,
          },
        ],
      });

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error).toBe('FORBIDDEN');
  });

  it('restricts POST /medicines/quick-add to DOCTOR/ADMIN', async () => {
    // DOCTOR can quick-add
    const okRes = await request(app)
      .post('/medicines/quick-add')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        displayName: `Test Medicine ${Date.now()}`,
        defaultDose: '1 tab',
        defaultFrequency: 'BID',
        defaultDuration: 5,
        form: 'TABLET',
      });

    expect(okRes.status).toBe(201);
    expect(okRes.body.id).toBeDefined();

    // RECEPTION cannot quick-add
    const forbiddenRes = await request(app)
      .post('/medicines/quick-add')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({
        displayName: `Should Fail ${Date.now()}`,
        defaultDose: '1 tab',
        defaultFrequency: 'BID',
        defaultDuration: 5,
        form: 'TABLET',
      });

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error).toBe('FORBIDDEN');
  });

  it('restricts /reports to ADMIN only', async () => {
    const date = '2030-01-01';

    // ADMIN can access reports
    const adminRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ date });

    expect([200, 400]).toContain(adminRes.status);
    if (adminRes.status === 200) {
      expect(adminRes.body).toHaveProperty('date');
    }

    // DOCTOR cannot
    const doctorRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ date });

    expect(doctorRes.status).toBe(403);
    expect(doctorRes.body.error).toBe('FORBIDDEN');

    // RECEPTION cannot
    const receptionRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ date });

    expect(receptionRes.status).toBe(403);
    expect(receptionRes.body.error).toBe('FORBIDDEN');
  });
});
