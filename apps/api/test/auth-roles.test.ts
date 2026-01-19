import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/server';
import { userRepository } from '../src/repositories/userRepository';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

type Role = 'RECEPTION' | 'DOCTOR' | 'ADMIN';

const mkUser = async (role: Role) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `${role.toLowerCase()}-auth-roles-${suffix}@example.com`;
  const password = `${role}Pass123!`;
  const passwordHash = await bcrypt.hash(password, 10);

  await userRepository.createUser({
    email,
    displayName: `${role} Auth Roles User ${suffix}`,
    passwordHash,
    role,
    active: true,
  });

  const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
  return login.body.tokens.accessToken as string;
};

let receptionToken: string;
let doctorToken: string;
let adminToken: string;

const createdPatients: string[] = [];
const registerPatient = (id: string) => createdPatients.push(id);

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;
  for (const id of ids) await deletePatientCompletely(id);
});

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

  const patientId = res.body.patientId as string;
  registerPatient(patientId);
  return patientId;
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

  return res.body.visit.visitId as string;
}

describe('Auth roles', () => {
  it('allows RECEPTION to access /patients, /visits, /reports and read rx endpoint (GET /visits/:id/rx)', async () => {
    const patientsRes = await request(app)
      .get('/patients')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ query: 'test', limit: '5' });

    expect([200, 400]).toContain(patientsRes.status);

    const patientId = await createPatient(receptionToken);
    const visitId = await createVisit(receptionToken, patientId, 'DOCTOR#AUTH_ROLES');

    const queueRes = await request(app)
      .get('/visits/queue')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ doctorId: 'DOCTOR#AUTH_ROLES', date: '2030-01-01' });

    expect([200, 400]).toContain(queueRes.status);

    const rxGetRes = await request(app)
      .get(`/visits/${visitId}/rx`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .expect(200);

    expect(rxGetRes.body).toHaveProperty('rx');

    const reportsRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ date: '2030-01-01' });

    expect([200, 400]).toContain(reportsRes.status);
  });

  it('allows DOCTOR to access /visits, /medicines, /xrays but not /admin routes', async () => {
    const visitsRes = await request(app)
      .get('/visits/queue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ doctorId: 'DOCTOR#AUTH_ROLES', date: '2030-01-01' });

    expect([200, 400]).toContain(visitsRes.status);

    const medsRes = await request(app)
      .get('/medicines')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ query: 'test', limit: '5' });

    expect([200, 400]).toContain(medsRes.status);
    expect(medsRes.status).not.toBe(401);
    expect(medsRes.status).not.toBe(403);

    const xrayRes = await request(app)
      .get('/xrays/non-existing-id/url')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect([200, 400, 404]).toContain(xrayRes.status);
    expect(xrayRes.status).not.toBe(401);
    expect(xrayRes.status).not.toBe(403);

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

  it('restricts POST /visits/:visitId/rx to DOCTOR/ADMIN (avoid S3 by sending invalid body)', async () => {
    const patientId = await createPatient(receptionToken);
    const visitId = await createVisit(receptionToken, patientId, 'DOCTOR#AUTH_RX');

    const doctorRes = await request(app)
      .post(`/visits/${visitId}/rx`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({});

    expect(doctorRes.status).toBe(400);
    expect(doctorRes.body.error).toBe('VALIDATION_ERROR');

    const forbiddenRes = await request(app)
      .post(`/visits/${visitId}/rx`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({});

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error).toBe('FORBIDDEN');
  });

  it('restricts POST /medicines/quick-add to DOCTOR/ADMIN', async () => {
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

  it('allows /reports to all (ADMIN/DOCTOR/RECEPTION)', async () => {
    const date = '2030-01-01';

    const adminRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ date });

    expect([200, 400]).toContain(adminRes.status);

    const doctorRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ date });

    expect([200, 400]).toContain(doctorRes.status);

    const receptionRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', `Bearer ${receptionToken}`)
      .query({ date });

    expect([200, 400]).toContain(receptionRes.status);
  });
});
