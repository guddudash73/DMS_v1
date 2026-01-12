import request from 'supertest';
import { createApp } from '../../src/server';
import type { Role } from '@dms/types';
import { TEST_USERS, seedTestUsers } from './testUsers';

const app = createApp();

let seeded = false;

// cache per-role bearer strings (sync getters)
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

/**
 * Synchronous header getters that return a real string.
 * Internally they cache the token once fetched.
 *
 * IMPORTANT: before first use in a test run, you must call `await warmAuth()`
 * from a beforeAll (once per test file or in global setup).
 */
export async function warmAuth() {
  // prime all three in parallel, and cache them
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
    // Fail loudly with a useful message instead of silent 401s
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
