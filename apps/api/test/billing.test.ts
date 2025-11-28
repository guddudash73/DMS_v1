import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { asReception, asAdmin } from './helpers/auth';

const app = createApp();

async function createPatient(name: string, phone: string) {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name,
      dob: '1990-01-01',
      gender: 'female',
      phone,
    })
    .expect(201);

  return res.body.patientId as string;
}

async function createVisitForPatient(patientId: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', asReception())
    .send({
      patientId,
      doctorId: 'DOCTOR#BILL',
      reason: 'Billing test visit',
    })
    .expect(201);

  return res.body as { visitId: string; visitDate: string; patientId: string };
}

async function completeVisit(visitId: string) {
  await request(app)
    .patch(`/visits/${visitId}/status`)
    .set('Authorization', asReception())
    .send({ status: 'IN_PROGRESS' })
    .expect(200);

  await request(app)
    .patch(`/visits/${visitId}/status`)
    .set('Authorization', asReception())
    .send({ status: 'DONE' })
    .expect(200);
}

const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('Billing / Checkout API', () => {
  it('creates immutable billing record and updates visit billingAmount', async () => {
    const patientId = await createPatient('Billing Patient 1', '+919900000001');
    const visit = await createVisitForPatient(patientId);

    await completeVisit(visit.visitId);

    const checkoutRes = await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [
          { description: 'Consultation', quantity: 1, unitAmount: 500 },
          { description: 'X-ray', quantity: 1, unitAmount: 300 },
        ],
        discountAmount: 100,
        taxAmount: 0,
      })
      .expect(201);

    expect(checkoutRes.body.visitId).toBe(visit.visitId);
    expect(checkoutRes.body.subtotal).toBe(800);
    expect(checkoutRes.body.discountAmount).toBe(100);
    expect(checkoutRes.body.taxAmount).toBe(0);
    expect(checkoutRes.body.total).toBe(700);

    const visitRes = await request(app)
      .get(`/visits/${visit.visitId}`)
      .set('Authorization', asReception())
      .expect(200);

    expect(visitRes.body.billingAmount).toBe(700);

    const reportRes = await request(app)
      .get('/reports/daily')
      .set('Authorization', asAdmin())
      .query({ date: visit.visitDate })
      .expect(200);

    expect(reportRes.body.totalRevenue).toBeGreaterThanOrEqual(700);
  });

  it('rejects checkout when visit is not DONE', async () => {
    const patientId = await createPatient('Billing Patient 2', '+919900000002');
    const visit = await createVisitForPatient(patientId);

    const res = await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [{ description: 'Consultation', quantity: 1, unitAmount: 500 }],
        discountAmount: 0,
        taxAmount: 0,
      })
      .expect(409);

    expect(res.body.error).toBe('VISIT_NOT_DONE');
  });

  it('prevents duplicate checkout for the same visit', async () => {
    const patientId = await createPatient('Billing Patient 3', '+919900000003');
    const visit = await createVisitForPatient(patientId);
    await completeVisit(visit.visitId);

    await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [{ description: 'Consultation', quantity: 1, unitAmount: 400 }],
        discountAmount: 0,
        taxAmount: 0,
      })
      .expect(201);

    const res = await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [{ description: 'Consultation', quantity: 1, unitAmount: 400 }],
        discountAmount: 0,
        taxAmount: 0,
      })
      .expect(409);

    expect(res.body.error).toBe('DUPLICATE_CHECKOUT');
  });

  it('rejects discounts that exceed subtotal', async () => {
    const patientId = await createPatient('Billing Patient 4', '+919900000004');
    const visit = await createVisitForPatient(patientId);
    await completeVisit(visit.visitId);

    const res = await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [{ description: 'Consultation', quantity: 1, unitAmount: 300 }],
        discountAmount: 500,
        taxAmount: 0,
      })
      .expect(400);

    expect(res.body.error).toBe('BILLING_RULE_VIOLATION');
  });

  it('creates follow-up atomically when followUp is provided at checkout', async () => {
    const patientId = await createPatient('Billing Patient 5', '+919900000005');
    const visit = await createVisitForPatient(patientId);
    await completeVisit(visit.visitId);

    const followUpDate = plusDays(1);

    const checkoutRes = await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [{ description: 'Consultation', quantity: 1, unitAmount: 500 }],
        discountAmount: 0,
        taxAmount: 0,
        followUp: {
          followUpDate,
          reason: 'Post-treatment check',
          contactMethod: 'CALL',
        },
      })
      .expect(201);

    expect(checkoutRes.body.visitId).toBe(visit.visitId);
    expect(checkoutRes.body.total).toBe(500);

    const followUpRes = await request(app)
      .get(`/visits/${visit.visitId}/followup`)
      .set('Authorization', asReception())
      .expect(200);

    expect(followUpRes.body.visitId).toBe(visit.visitId);
    expect(followUpRes.body.followUpDate).toBe(followUpDate);
    expect(followUpRes.body.status).toBe('ACTIVE');
  });

  it('rejects checkout when followUpDate is in the past', async () => {
    const patientId = await createPatient('Billing Patient 6', '+919900000006');
    const visit = await createVisitForPatient(patientId);
    await completeVisit(visit.visitId);

    const pastDate = '2000-01-01';

    const res = await request(app)
      .post(`/visits/${visit.visitId}/checkout`)
      .set('Authorization', asReception())
      .send({
        items: [{ description: 'Consultation', quantity: 1, unitAmount: 500 }],
        discountAmount: 0,
        taxAmount: 0,
        followUp: {
          followUpDate: pastDate,
          reason: 'Invalid past follow-up',
        },
      })
      .expect(400);

    expect(res.body.error).toBe('FOLLOWUP_RULE_VIOLATION');
  });
});
