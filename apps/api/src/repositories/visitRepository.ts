import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DYNAMO_ENDPOINT, DDB_TABLE_NAME } from '../config/env';
import type { Visit, VisitCreate, VisitStatus, VisitQueueQuery } from '@dms/types';

export class InvalidStatusTransitionError extends Error {
  readonly code = 'INVALID_STATUS_TRANSITION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidStatusTransitionError';
  }
}

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = DDB_TABLE_NAME;
if (!TABLE_NAME) {
  throw new Error('DDB_TABLE_NAME env var is required');
}

const buildPatientVisitKeys = (patientId: string, visitId: string) => ({
  PK: `PATIENT#${patientId}`,
  SK: `VISIT#${visitId}`,
});

const buildVisitMetaKeys = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'META',
});

const toDateString = (timestampMs: number): string => {
  return new Date(timestampMs).toISOString().slice(0, 10);
};

const buildGsi2keys = (doctorId: string, date: string, status: VisitStatus, ts: number) => ({
  GSI2PK: `DOCTOR#${doctorId}#DATE#${date}`,
  GSI2SK: `STATUS#${status}#TS#${ts}`,
});

const buildGsi3Keys = (date: string, visitId: string) => ({
  GSI3PK: `DATE#${date}`,
  GSI3SK: `TYPE#VISIT#ID#${visitId}`,
});

export interface VisitRepository {
  create(input: VisitCreate): Promise<Visit>;
  getById(visitId: string): Promise<Visit | null>;
  listByPatientId(patientId: string): Promise<Visit[]>;
  updateStatus(visitId: string, nextStatus: VisitStatus): Promise<Visit | null>;
  getDoctorQueue(params: VisitQueueQuery): Promise<Visit[]>;
  listByDate(date: string): Promise<Visit[]>;
}

export class DynamoDBVisitRepository implements VisitRepository {
  async create(input: VisitCreate): Promise<Visit> {
    const now = Date.now();
    const visitId = randomUUID();
    const visitDate = toDateString(now);
    const status: VisitStatus = 'QUEUED';

    const base: Visit = {
      visitId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      reason: input.reason,
      status,
      visitDate,
      createdAt: now,
      updatedAt: now,
      // billingAmount: undefined initially; filled after checkout.
    };

    const patientItem = {
      ...buildPatientVisitKeys(input.patientId, visitId),
      entityType: 'PATIENT_VISIT',
      ...base,
    };

    const metaItem = {
      ...buildVisitMetaKeys(visitId),
      entityType: 'VISIT',
      ...base,
      ...buildGsi2keys(input.doctorId, visitDate, status, now),
      ...buildGsi3Keys(visitDate, visitId),
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: patientItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: metaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );

    return base;
  }

  async getById(visitId: string): Promise<Visit | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKeys(visitId),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'VISIT') return null;
    return Item as Visit;
  }

  async listByPatientId(patientId: string): Promise<Visit[]> {
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `PATIENT#${patientId}`,
          ':skPrefix': 'VISIT#',
        },
        ScanIndexForward: false,
      }),
    );

    if (!Items || Items.length === 0) return [];
    return Items as Visit[];
  }

  async updateStatus(visitId: string, nextStatus: VisitStatus): Promise<Visit | null> {
    const current = await this.getById(visitId);
    if (!current) return null;

    const validTransition =
      (current.status === 'QUEUED' && nextStatus === 'IN_PROGRESS') ||
      (current.status === 'IN_PROGRESS' && nextStatus === 'DONE');

    if (!validTransition) {
      throw new InvalidStatusTransitionError(
        `Invalid status transaction ${current.status} -> ${nextStatus}`,
      );
    }

    const now = Date.now();
    const visitDate = current.visitDate;

    const metaKey = buildVisitMetaKeys(visitId);
    const queueKeys = buildGsi2keys(current.doctorId, visitDate, nextStatus, now);

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: metaKey,
        UpdateExpression:
          'SET #status = :status, #updatedAt = :updatedAt, #GSI2PK = :gsi2pk, #GSI2SK = :gsi2sk',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
          '#GSI2PK': 'GSI2PK',
          '#GSI2SK': 'GSI2SK',
        },
        ExpressionAttributeValues: {
          ':status': nextStatus,
          ':updatedAt': now,
          ':gsi2pk': queueKeys.GSI2PK,
          ':gsi2sk': queueKeys.GSI2SK,
          ':expectedStatus': current.status,
        },
        ConditionExpression: 'attribute_exists(PK) AND #status = :expectedStatus',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes) return null;

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildPatientVisitKeys(current.patientId, visitId),
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': nextStatus,
          ':updatedAt': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    return Attributes as Visit;
  }

  async getDoctorQueue(params: VisitQueueQuery): Promise<Visit[]> {
    const { doctorId, date, status } = params;
    const today = toDateString(Date.now());
    const queryDate = date ?? today;

    let keyCondition = 'GSI2PK = :pk';
    const exprValues: Record<string, unknown> = {
      ':pk': `DOCTOR#${doctorId}#DATE#${queryDate}`,
    };

    if (status) {
      keyCondition += ' AND begins_with(GSI2SK, :skPrefix)';
      exprValues[':skPrefix'] = `STATUS#${status}`;
    }

    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        ScanIndexForward: true,
      }),
    );

    if (!Items || Items.length === 0) return [];
    return Items as Visit[];
  }

  async listByDate(date: string): Promise<Visit[]> {
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `DATE#${date}`,
          ':skPrefix': 'TYPE#VISIT#ID#',
        },
        ScanIndexForward: true,
      }),
    );

    if (!Items || Items.length === 0) return [];
    return Items as Visit[];
  }
}

export const visitRepository: VisitRepository = new DynamoDBVisitRepository();
