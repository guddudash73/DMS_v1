import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/server';
import { userRepository } from '../src/repositories/userRepository';

const app = createApp();
const runId = Date.now();

function getSetCookieHeader(res: request.Response): string {
  const raw = (res.headers as Record<string, unknown>)['set-cookie'];
  if (!raw) return '';
  if (Array.isArray(raw)) return raw.join(';');
  return String(raw);
}

describe('Auth flows', () => {
  const adminEmail = `admin-${runId}@example.com`;
  const adminPassword = 'AdminPass123!';
  let adminId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const user = await userRepository.createUser({
      email: adminEmail,
      displayName: 'Admin User',
      passwordHash,
      role: 'ADMIN',
    });
    adminId = user.userId;
  });

  it('logs in with valid credentials and returns access token + sets refresh cookie', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    expect(res.body.userId).toBe(adminId);
    expect(res.body.tokens?.accessToken).toBeDefined();
    expect(res.body.tokens?.expiresInSec).toBeTypeOf('number');

    const cookieHeader = getSetCookieHeader(res);
    expect(cookieHeader).toContain('refreshToken=');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: adminEmail, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
    expect(res.body.message).toBeDefined();
  });

  it('locks account after repeated invalid logins (MAX_LOGIN_ATTEMPTS=20)', async () => {
    for (let i = 0; i < 20; i++) {
      await request(app)
        .post('/auth/login')
        .send({ email: adminEmail, password: 'wrong-password' });
    }

    const res = await request(app)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('ACCOUNT_LOCKED');
    expect(res.body.lockUntil).toBeDefined();
  });

  it('refresh flow: happy path (cookie-based, agent keeps cookies)', async () => {
    const email = `fresh-admin-${runId}@example.com`;
    const password = 'FreshAdmin123!';
    const hash = await bcrypt.hash(password, 10);

    await userRepository.createUser({
      email,
      displayName: 'Fresh Admin',
      passwordHash: hash,
      role: 'ADMIN',
    });

    const agent = request.agent(app);

    const loginRes = await agent.post('/auth/login').send({ email, password }).expect(200);
    expect(loginRes.body.tokens?.accessToken).toBeDefined();

    const refresh1 = await agent.post('/auth/refresh').send({}).expect(200);
    expect(refresh1.body.tokens?.accessToken).toBeDefined();

    const refresh2 = await agent.post('/auth/refresh').send({}).expect(200);
    expect(refresh2.body.tokens?.accessToken).toBeDefined();
  });

  it('enforces ADMIN-only access to /admin/doctors', async () => {
    const email = `rbac-admin-${runId}@example.com`;
    const password = 'AdminRbacPass123!';
    const passwordHash = await bcrypt.hash(password, 10);

    await userRepository.createUser({
      email,
      displayName: 'RBAC Admin',
      passwordHash,
      role: 'ADMIN',
    });

    const loginRes = await request(app).post('/auth/login').send({ email, password }).expect(200);
    const adminAccess = loginRes.body.tokens.accessToken as string;

    const adminRes = await request(app)
      .get('/admin/doctors')
      .set('Authorization', `Bearer ${adminAccess}`);

    expect(adminRes.status).toBe(200);

    const doctorEmail = `doc-${runId}@example.com`;
    const doctorPassword = 'DocPass123!';
    const doctorHash = await bcrypt.hash(doctorPassword, 10);

    await userRepository.createUser({
      email: doctorEmail,
      displayName: 'Dr Doe',
      passwordHash: doctorHash,
      role: 'DOCTOR',
    });

    const doctorLogin = await request(app)
      .post('/auth/login')
      .send({ email: doctorEmail, password: doctorPassword })
      .expect(200);

    const doctorAccess = doctorLogin.body.tokens.accessToken as string;

    const forbidden = await request(app)
      .get('/admin/doctors')
      .set('Authorization', `Bearer ${doctorAccess}`);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe('FORBIDDEN');
  });
});
