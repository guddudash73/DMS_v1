// apps/api/test/rx.test.ts
import { afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { prescriptionRepository } from '../src/repositories/prescriptionRepository';
import type { Prescription } from '@dms/types';
import { asDoctor, asReception } from './helpers/auth';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

const createdPatients: string[] = [];
const registerPatient = (id: string) => createdPatients.push(id);

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;
  for (const id of ids) await deletePatientCompletely(id);
});

async function createPatient(name: string, phone: string) {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({ name, dob: '1990-01-01', gender: 'female', phone })
    .expect(201);

  const patientId = res.body.patientId as string;
  registerPatient(patientId);
  return patientId;
}

async function createVisit(patientId: string, doctorId: string, reason: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', asReception())
    .send({ patientId, doctorId, reason })
    .expect(201);

  return res.body as { visitId: string; visitDate: string; patientId: string };
}

async function markVisitDone(visitId: string) {
  await request(app)
    .patch(`/visits/${visitId}/status`)
    .set('Authorization', asReception())
    .send({ status: 'DONE' })
    .expect(200);
}

describe('Prescription API (Option 2: stable draft + single revision)', () => {
  it('creates a first prescription version for a visit and persists metadata', async () => {
    const patientId = await createPatient('Rx Test Patient 1', '+910000000201');
    const visit = await createVisit(patientId, 'DOCTOR#RX1', 'Rx test visit 1');

    const createRes = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [{ medicine: 'Amoxicillin 500mg', dose: '500mg', frequency: 'BID', duration: 5 }],
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

  it('overwrites draft (v1) before DONE; creates exactly one revision (v2) after DONE', async () => {
    const patientId = await createPatient('Rx Versioning Patient', '+910000000202');
    const visit = await createVisit(patientId, 'DOCTOR#RX2', 'Rx versioning visit');

    // v1 create
    const v1Res = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [{ medicine: 'Ibuprofen 400mg', dose: '400mg', frequency: 'TID', duration: 3 }],
      })
      .expect(201);

    const v1Id = v1Res.body.rxId as string;
    expect(v1Res.body.version).toBe(1);

    // overwrite draft (still v1, same rxId)
    const v1OverwriteRes = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [
          { medicine: 'Ibuprofen 400mg', dose: '400mg', frequency: 'TID', duration: 3 },
          { medicine: 'Pantoprazole 40mg', dose: '40mg', frequency: 'QD', duration: 5 },
        ],
      })
      .expect(201);

    expect(v1OverwriteRes.body.version).toBe(1);
    expect(v1OverwriteRes.body.rxId).toBe(v1Id);

    // now mark DONE
    await markVisitDone(visit.visitId);

    // first save after DONE => creates revision v2 (new rxId)
    const v2Res = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [
          { medicine: 'Ibuprofen 400mg', dose: '400mg', frequency: 'TID', duration: 3 },
          { medicine: 'Pantoprazole 40mg', dose: '40mg', frequency: 'QD', duration: 5 },
          { medicine: 'Mouthwash', dose: '10ml', frequency: 'BID', duration: 7 },
        ],
      })
      .expect(201);

    const v2Id = v2Res.body.rxId as string;
    expect(v2Res.body.version).toBe(2);
    expect(v2Id).not.toBe(v1Id);

    // another save after DONE => still v2 and same rxId
    const v2OverwriteRes = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [{ medicine: 'Mouthwash', dose: '10ml', frequency: 'BID', duration: 7 }],
      })
      .expect(201);

    expect(v2OverwriteRes.body.version).toBe(2);
    expect(v2OverwriteRes.body.rxId).toBe(v2Id);

    // repository versions: only v1 and v2
    const versions = await prescriptionRepository.listByVisit(visit.visitId);
    expect(versions.length).toBe(2);

    const v1Meta = versions.find((p) => p.version === 1) as Prescription | undefined;
    const v2Meta = versions.find((p) => p.version === 2) as Prescription | undefined;

    expect(v1Meta).toBeDefined();
    expect(v2Meta).toBeDefined();

    expect(v1Meta!.rxId).toBe(v1Id);
    expect(v2Meta!.rxId).toBe(v2Id);

    // v1 stayed with 2 lines (from overwrite before DONE)
    expect(v1Meta!.lines.length).toBe(2);

    // v2 now reflects latest overwrite after DONE (1 line)
    expect(v2Meta!.lines.length).toBe(1);
  });

  it('returns a signed URL for prescription JSON via GET /rx/:id/json-url', async () => {
    const patientId = await createPatient('Rx URL Patient', '+910000000203');
    const visit = await createVisit(patientId, 'DOCTOR#RX3', 'Rx URL visit');

    const createRes = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [{ medicine: 'Paracetamol 500mg', dose: '500mg', frequency: 'QID', duration: 2 }],
      })
      .expect(201);

    const rxId = createRes.body.rxId as string;

    const urlRes = await request(app)
      .get(`/rx/${rxId}/json-url`)
      .set('Authorization', asDoctor())
      .expect(200);

    expect(urlRes.body.rxId).toBe(rxId);
    expect(typeof urlRes.body.url).toBe('string');
    expect(urlRes.body.url.length).toBeGreaterThan(0);
  });

  it('rejects invalid prescription payloads', async () => {
    const patientId = await createPatient('Rx Invalid Patient', '+910000000204');
    const visit = await createVisit(patientId, 'DOCTOR#RX4', 'Rx invalid visit');

    const res1 = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({})
      .expect(400);

    expect(res1.body.error).toBe('VALIDATION_ERROR');

    const res2 = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({ lines: [] })
      .expect(400);

    expect(res2.body.error).toBe('VALIDATION_ERROR');

    const res3 = await request(app)
      .post(`/visits/${visit.visitId}/rx`)
      .set('Authorization', asDoctor())
      .send({
        lines: [{ medicine: '', dose: '', frequency: 'BID', duration: 5 }],
      })
      .expect(400);

    expect(res3.body.error).toBe('VALIDATION_ERROR');
  });
});
