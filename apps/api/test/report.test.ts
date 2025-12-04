import { afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../src/config/env';
import { asReception, asAdmin } from './helpers/auth';
import { deletePatientCompletely } from './helpers/patients';

const app = createApp();

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const createdPatients: string[] = [];
const registerPatient = (id: string) => {
  createdPatients.push(id);
};

afterEach(async () => {
  const ids = [...createdPatients];
  createdPatients.length = 0;

  for (const id of ids) {
    await deletePatientCompletely(id);
  }
});

async function createPatient(name: string, phone: string) {
  const res = await request(app)
    .post('/patients')
    .set('Authorization', asReception())
    .send({
      name,
      dob: '1990-01-01',
      gender: 'male',
      phone,
    })
    .expect(201);

  const patientId = res.body.patientId as string;
  registerPatient(patientId);
  return patientId;
}

async function createVisit(patientId: string, doctorId: string, reason: string) {
  const res = await request(app)
    .post('/visits')
    .set('Authorization', asReception())
    .send({
      patientId,
      doctorId,
      reason,
    })
    .expect(201);

  return res.body as { visitId: string; visitDate: string; patientId: string };
}

async function setVisitDateAndBilling(
  visitId: string,
  patientId: string,
  date: string,
  billingAmount?: number,
) {
  const gsi3pk = `DATE#${date}`;
  const gsi3sk = `TYPE#VISIT#ID#${visitId}`;

  const metaNames: Record<string, string> = {
    '#visitDate': 'visitDate',
    '#GSI3PK': 'GSI3PK',
    '#GSI3SK': 'GSI3SK',
  };
  const metaValues: Record<string, unknown> = {
    ':date': date,
    ':gsi3pk': gsi3pk,
    ':gsi3sk': gsi3sk,
  };
  let metaUpdateExpr = 'SET #visitDate = :date, #GSI3PK = :gsi3pk, #GSI3SK = :gsi3sk';

  if (billingAmount !== undefined) {
    metaNames['#billingAmount'] = 'billingAmount';
    metaValues[':billingAmount'] = billingAmount;
    metaUpdateExpr += ', #billingAmount = :billingAmount';
  }

  await docClient.send(
    new UpdateCommand({
      TableName: DDB_TABLE_NAME,
      Key: { PK: `VISIT#${visitId}`, SK: 'META' },
      UpdateExpression: metaUpdateExpr,
      ExpressionAttributeNames: metaNames,
      ExpressionAttributeValues: metaValues,
    }),
  );

  const pvNames: Record<string, string> = {
    '#visitDate': 'visitDate',
  };
  const pvValues: Record<string, unknown> = {
    ':date': date,
  };
  let pvUpdateExpr = 'SET #visitDate = :date';

  if (billingAmount !== undefined) {
    pvNames['#billingAmount'] = 'billingAmount';
    pvValues[':billingAmount'] = billingAmount;
    pvUpdateExpr += ', #billingAmount = :billingAmount';
  }

  await docClient.send(
    new UpdateCommand({
      TableName: DDB_TABLE_NAME,
      Key: { PK: `PATIENT#${patientId}`, SK: `VISIT#${visitId}` },
      UpdateExpression: pvUpdateExpr,
      ExpressionAttributeNames: pvNames,
      ExpressionAttributeValues: pvValues,
    }),
  );
}

async function clearVisitsForDate(date: string) {
  const gsi3pk = `DATE#${date}`;

  const queryResult = await docClient.send(
    new QueryCommand({
      TableName: DDB_TABLE_NAME,
      IndexName: 'GSI3',
      KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': gsi3pk,
        ':skPrefix': 'TYPE#VISIT#ID#',
      },
    }),
  );

  const items = queryResult.Items ?? [];
  if (items.length === 0) return;

  for (const item of items) {
    const visitId = item.visitId as string | undefined;
    const patientId = item.patientId as string | undefined;
    if (!visitId || !patientId) continue;

    await docClient.send(
      new DeleteCommand({
        TableName: DDB_TABLE_NAME,
        Key: { PK: `VISIT#${visitId}`, SK: 'META' },
      }),
    );

    await docClient.send(
      new DeleteCommand({
        TableName: DDB_TABLE_NAME,
        Key: { PK: `PATIENT#${patientId}`, SK: `VISIT#${visitId}` },
      }),
    );
  }
}

describe('Daily Reports API', () => {
  it('returns zeros when there is no data for the given date', async () => {
    const date = '2000-01-01';
    await clearVisitsForDate(date);

    const res = await request(app)
      .get('/reports/daily')
      .set('Authorization', asAdmin())
      .query({ date })
      .expect(200);

    expect(res.body).toEqual({
      date,
      visitCountsByStatus: {
        QUEUED: 0,
        IN_PROGRESS: 0,
        DONE: 0,
      },
      totalRevenue: 0,
      procedureCounts: {},
    });
  });

  it('handles only QUEUED visits for a given date', async () => {
    const date = '2030-01-01';
    await clearVisitsForDate(date);

    const patientId1 = await createPatient('Queued Patient 1', '+919999000001');
    const v1 = await createVisit(patientId1, 'DOCTOR#QUEUE', 'Queued only 1');

    const patientId2 = await createPatient('Queued Patient 2', '+919999000002');
    const v2 = await createVisit(patientId2, 'DOCTOR#QUEUE', 'Queued only 2');

    await setVisitDateAndBilling(v1.visitId, v1.patientId, date);
    await setVisitDateAndBilling(v2.visitId, v2.patientId, date);

    const res = await request(app)
      .get('/reports/daily')
      .set('Authorization', asAdmin())
      .query({ date })
      .expect(200);

    expect(res.body.date).toBe(date);
    expect(res.body.visitCountsByStatus).toEqual({
      QUEUED: 2,
      IN_PROGRESS: 0,
      DONE: 0,
    });
    expect(res.body.totalRevenue).toBe(0);
    expect(res.body.procedureCounts).toEqual({});
  });

  it('aggregates mixed statuses with some missing bills', async () => {
    const date = '2030-01-02';
    await clearVisitsForDate(date);

    const p1 = await createPatient('Revenue Patient 1', '+919999000101');
    const v1 = await createVisit(p1, 'DOCTOR#REV', 'Done with bill');

    const p2 = await createPatient('Revenue Patient 2', '+919999000102');
    const v2 = await createVisit(p2, 'DOCTOR#REV', 'Done without bill');

    const p3 = await createPatient('Revenue Patient 3', '+919999000103');
    const v3 = await createVisit(p3, 'DOCTOR#REV', 'Queued with bill');

    await request(app)
      .patch(`/visits/${v1.visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    await request(app)
      .patch(`/visits/${v1.visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'DONE' })
      .expect(200);

    await request(app)
      .patch(`/visits/${v2.visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    await request(app)
      .patch(`/visits/${v2.visitId}/status`)
      .set('Authorization', asReception())
      .send({ status: 'DONE' })
      .expect(200);

    await setVisitDateAndBilling(v1.visitId, v1.patientId, date, 1000);
    await setVisitDateAndBilling(v2.visitId, v2.patientId, date);
    await setVisitDateAndBilling(v3.visitId, v3.patientId, date, 500);

    const res = await request(app)
      .get('/reports/daily')
      .set('Authorization', asAdmin())
      .query({ date })
      .expect(200);

    expect(res.body.date).toBe(date);
    expect(res.body.visitCountsByStatus).toEqual({
      QUEUED: 1,
      IN_PROGRESS: 0,
      DONE: 2,
    });

    expect(res.body.totalRevenue).toBe(1500);
    expect(res.body.procedureCounts).toEqual({});
  });

  it('rejects invalid date input', async () => {
    const res = await request(app)
      .get('/reports/daily')
      .set('Authorization', asAdmin())
      .query({ date: 'invalid-date' })
      .expect(400);

    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
