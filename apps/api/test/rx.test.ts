import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { prescriptionRepository } from '../src/repositories/prescriptionRepository';
import type { Prescription } from '@dms/types';

const app = createApp();

async function createPatient(name: string, phone: string) {
  const res = await request(app)
    .post('/patients')
    .send({
      name,
      dob: '1990-01-01',
      gender: 'female',
      phone,
    })
    .expect(201);

  return res.body.patientId as string;
}

async function createVisit(patientId: string, doctorId: string, reason: string) {
  const res = await request(app)
    .post('/visits')
    .send({
      patientId,
      doctorId,
      reason,
    })
    .expect(201);

  return res.body as { visitId: string; visitDate: string; patientId: string };
}

describe('Prescription API', () => {
  it('creates a first prescription version for a visit and persists metadata', async () => {
    const patientId = await createPatient('Rx Test Patient 1', '+910000000201');
    const visit = await createVisit(patientId, 'DOCTOR#RX1', 'Rx test visit 1');

    const createRes = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .send({
        lines: [
          {
            medicine: 'Amoxicillin 500mg',
            dose: '500mg',
            frequency: 'BID',
            duration: 5,
          },
        ],
      })
      .expect(201);

    expect(createRes.body).toHaveProperty('rxId');
    expect(createRes.body.visitId).toBe(visit.visitId);
    expect(createRes.body.version).toBe(1);

    const rxId = createRes.body.rxId as string;

    const meta = await prescriptionRepository.getById(rxId);
    expect(meta).not.toBeNull();
    expect(meta!.visitId).toBe(visit.visitId);
    expect(meta!.version).toBe(1);
  });

  it('creates multiple prescription versions for the same visit and keeps older versions unchanged', async () => {
    const patientId = await createPatient('Rx Versioning Patient', '+910000000202');
    const visit = await createVisit(patientId, 'DOCTOR#RX2', 'Rx versioning visit');

    // v1
    const v1Res = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .send({
        lines: [
          {
            medicine: 'Ibuprofen 400mg',
            dose: '400mg',
            frequency: 'TID',
            duration: 3,
          },
        ],
      })
      .expect(201);

    const v1Id = v1Res.body.rxId as string;
    expect(v1Res.body.version).toBe(1);

    // v2
    const v2Res = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .send({
        lines: [
          {
            medicine: 'Ibuprofen 400mg',
            dose: '400mg',
            frequency: 'TID',
            duration: 3,
          },
          {
            medicine: 'Pantoprazole 40mg',
            dose: '40mg',
            frequency: 'QD',
            duration: 5,
          },
        ],
      })
      .expect(201);

    const v2Id = v2Res.body.rxId as string;
    expect(v2Res.body.version).toBe(2);
    expect(v2Id).not.toBe(v1Id);

    const versions = await prescriptionRepository.listByVisit(visit.visitId);
    expect(versions.length).toBe(2);

    const v1Meta = versions.find((p) => p.version === 1) as Prescription | undefined;
    const v2Meta = versions.find((p) => p.version === 2) as Prescription | undefined;

    expect(v1Meta).toBeDefined();
    expect(v2Meta).toBeDefined();

    expect(v1Meta!.lines.length).toBe(1);
    expect(v1Meta!.lines[0].medicine).toBe('Ibuprofen 400mg');

    expect(v2Meta!.lines.length).toBe(2);
  });

  it('returns a signed URL for prescription JSON via GET /rx/:id/json-url', async () => {
    const patientId = await createPatient('Rx URL Patient', '+910000000203');
    const visit = await createVisit(patientId, 'DOCTOR#RX3', 'Rx URL visit');

    const createRes = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .send({
        lines: [
          {
            medicine: 'Paracetamol 500mg',
            dose: '500mg',
            frequency: 'QID',
            duration: 2,
          },
        ],
      })
      .expect(201);

    const rxId = createRes.body.rxId as string;

    const urlRes = await request(app).get(`/rx/${rxId}/json-url`).expect(200);

    expect(urlRes.body.rxId).toBe(rxId);
    expect(typeof urlRes.body.url).toBe('string');
    expect(urlRes.body.url.length).toBeGreaterThan(0);
  });

  it('rejects invalid prescription payloads', async () => {
    const patientId = await createPatient('Rx Invalid Patient', '+910000000204');
    const visit = await createVisit(patientId, 'DOCTOR#RX4', 'Rx invalid visit');

    const res1 = await request(app).post(`/visits/${visit.visitId}/rx`).send({}).expect(400);

    expect(res1.body.error).toBe('VALIDATION_ERROR');

    const res2 = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .send({
        lines: [],
      })
      .expect(400);

    expect(res2.body.error).toBe('VALIDATION_ERROR');

    const res3 = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .send({
        lines: [
          {
            medicine: '',
            dose: '',
            frequency: 'BID',
            duration: 5,
          },
        ],
      })
      .expect(400);

    expect(res3.body.error).toBe('VALIDATION_ERROR');
  });
});
