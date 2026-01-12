// apps/api/test/admin-rx-presets.test.ts
import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/server';
import { userRepository } from '../src/repositories/userRepository';
import type { RxLineType } from '@dms/types';

const app = createApp();

const runId = Date.now();

const mkUser = async (role: 'RECEPTION' | 'DOCTOR' | 'ADMIN') => {
  const email = `${role.toLowerCase()}-rxpreset-${runId}@example.com`;
  const password = `${role}Pass123!`;
  const passwordHash = await bcrypt.hash(password, 10);

  await userRepository.createUser({
    email,
    displayName: `${role} RxPreset User`,
    passwordHash,
    role,
    active: true,
  });

  const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
  return login.body.tokens.accessToken as string;
};

let adminToken: string;
let doctorToken: string;

beforeAll(async () => {
  [adminToken, doctorToken] = await Promise.all([mkUser('ADMIN'), mkUser('DOCTOR')]);
});

describe('Admin Rx-presets', () => {
  it('allows ADMIN to create and update presets', async () => {
    const line: RxLineType = {
      medicine: 'Amoxicillin 500mg',
      dose: '1 tab',
      frequency: 'TID',
      duration: 5,
      notes: 'After food',
      timing: undefined,
    };

    const createRes = await request(app)
      .post('/admin/rx-presets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Post extraction',
        lines: [line],
        tags: ['post-op'],
      })
      .expect(201);

    const presetId = (createRes.body.id ?? createRes.body.presetId) as string;
    expect(presetId).toBeDefined();

    const patchRes = await request(app)
      .patch(`/admin/rx-presets/${presetId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Post extraction updated' })
      .expect(200);

    expect(patchRes.body.name).toBe('Post extraction updated');
  });

  it('forbids DOCTOR from calling admin Rx-preset routes', async () => {
    const res = await request(app)
      .post('/admin/rx-presets')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        name: 'Should fail',
        lines: [],
        tags: [],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
});
