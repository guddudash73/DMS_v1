import { beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import type { MedicinePreset } from '@dcm/types';
import { warmAuth, asDoctor } from './helpers/auth';

const app = createApp();

let doctorAuthHeader: string;

beforeAll(async () => {
  await warmAuth();
  doctorAuthHeader = asDoctor();
});

describe('Medicines API', () => {
  it('quick-add creates a new medicine preset for a fresh normalized name', async () => {
    const displayName = `Amoxicillin 500mg ${Date.now()}`;

    const res = await request(app)
      .post('/medicines/quick-add')
      .set('Authorization', doctorAuthHeader)
      .send({
        displayName,
        defaultDose: '1 tab',
        defaultFrequency: 'BID',
        defaultQuantity: '5 Tabs',
        form: 'TABLET',
      })
      .expect(201);

    const preset = res.body as MedicinePreset;

    expect(preset.id).toBeDefined();
    expect(preset.displayName).toBe(displayName);
    expect(preset.defaultFrequency).toBe('BID');
    expect(preset.defaultQuantity).toBe('5 Tabs');
    expect(preset.source).toBe('INLINE_DOCTOR');
    expect(preset.verified).toBe(false);
  });

  it('quick-add returns existing preset when normalized name already exists', async () => {
    const baseName = `Test Cefadroxil 250mg ${Date.now()}`;
    const variant1 = baseName;
    const variant2 = `  ${baseName.toUpperCase()}  `;

    const firstRes = await request(app)
      .post('/medicines/quick-add')
      .set('Authorization', doctorAuthHeader)
      .send({
        displayName: variant1,
        defaultDose: '1 cap',
        defaultFrequency: 'BID',
        defaultQuantity: 7,
        form: 'CAPSULE',
      })
      .expect(201);

    const firstPreset = firstRes.body as MedicinePreset;

    const secondRes = await request(app)
      .post('/medicines/quick-add')
      .set('Authorization', doctorAuthHeader)
      .send({
        displayName: variant2,
        defaultDose: '1 cap',
        defaultFrequency: 'BID',
        defaultQuantity: 7,
        form: 'CAPSULE',
      })
      .expect(201);

    const secondPreset = secondRes.body as MedicinePreset;

    expect(secondPreset.id).toBe(firstPreset.id);
    expect(secondPreset.normalizedName).toBe(firstPreset.normalizedName);
  });

  it('GET /medicines?query= returns typeahead suggestions', async () => {
    const uniqueName = `Metronidazole 400mg ${Date.now()}`;

    await request(app)
      .post('/medicines/quick-add')
      .set('Authorization', doctorAuthHeader)
      .send({
        displayName: uniqueName,
        defaultDose: '1 tab',
        defaultFrequency: 'TID',
        defaultQuantity: 5,
        form: 'TABLET',
      })
      .expect(201);

    const searchRes = await request(app)
      .get('/medicines')
      .set('Authorization', doctorAuthHeader)
      .query({ query: uniqueName, limit: '10' })
      .expect(200);

    expect(Array.isArray(searchRes.body.items)).toBe(true);

    const found = (searchRes.body.items as any[]).find((item) => item.displayName === uniqueName);

    expect(found).toBeDefined();
    expect(found.defaultFrequency).toBe('TID');
    expect(found.defaultQuantity).toBe(5);
  });
});
