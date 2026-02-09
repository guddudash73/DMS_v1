import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { prescriptionPresetRepository } from '../src/repositories/prescriptionPresetRepository';
import { warmAuth, asDoctor } from './helpers/auth';

const app = createApp();

beforeAll(async () => {
  await warmAuth();
});

describe('Prescription presets API', () => {
  it('GET /rx-presets returns clinic-level templates created via repository', async () => {
    const name = `Post-extraction standard regimen ${Date.now()}`;

    const preset = await prescriptionPresetRepository.create({
      name,
      lines: [
        {
          medicine: 'Amoxicillin 500mg',
          dose: '500mg',
          frequency: 'TID',
          quantity: '5 Tabs',
        },
        {
          medicine: 'Ibuprofen 400mg',
          dose: '400mg',
          frequency: 'TID',
          quantity: '3 Tabs',
        },
      ],
      tags: ['POST_EXTRACTION'],
      createdByUserId: 'ADMIN#001',
      scope: 'ADMIN',
    });

    const res = await request(app)
      .get('/rx-presets')
      .set('Authorization', asDoctor())
      .query({ query: name, limit: '10' })
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    const found = res.body.items.find((p: any) => p.id === preset.id);

    expect(found).toBeDefined();
    expect(found.name).toBe(name);
    expect(Array.isArray(found.lines)).toBe(true);
    expect(found.lines.length).toBe(2);
  });
});
