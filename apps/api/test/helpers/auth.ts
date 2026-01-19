import request from 'supertest';
import { createApp } from '../../src/server';
import type { Role } from '@dcm/types';
import { TEST_USERS, seedTestUsers } from './testUsers';

const app = createApp();

let seeded = false;

const bearerByRole: Partial<Record<Role, string>> = {};
let inflight: Partial<Record<Role, Promise<string>>> = {};

async function ensureSeededOnce() {
  if (seeded) return;
  await seedTestUsers();
  seeded = true;
}

async function fetchBearer(role: Role): Promise<string> {
  await ensureSeededOnce();

  const u =
    role === 'ADMIN'
      ? TEST_USERS.admin
      : role === 'DOCTOR'
        ? TEST_USERS.doctor
        : TEST_USERS.reception;

  const res = await request(app)
    .post('/auth/login')
    .send({ email: u.email, password: u.password })
    .expect(200);

  const accessToken = res.body.tokens.accessToken as string;
  return `Bearer ${accessToken}`;
}

export async function warmAuth() {
  const [reception, doctor, admin] = await Promise.all([
    fetchBearer('RECEPTION'),
    fetchBearer('DOCTOR'),
    fetchBearer('ADMIN'),
  ]);

  bearerByRole.RECEPTION = reception;
  bearerByRole.DOCTOR = doctor;
  bearerByRole.ADMIN = admin;
}

function getBearerSync(role: Role): string {
  const b = bearerByRole[role];
  if (!b) {
    throw new Error(`Auth header for ${role} not warmed. Call 'await warmAuth()' in beforeAll().`);
  }
  return b;
}

export function asReception(): string {
  return getBearerSync('RECEPTION');
}

export function asDoctor(): string {
  return getBearerSync('DOCTOR');
}

export function asAdmin(): string {
  return getBearerSync('ADMIN');
}
