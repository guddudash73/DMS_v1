import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { Visit, Prescription, RxId, RxLineType } from '@dms/types';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const buildVisitRxKey = (visitId: string, rxId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: `RX#${rxId}`,
});

const buildRxMetaKey = (rxId: string) => ({
  PK: `RX#${rxId}`,
  SK: 'META',
});

export interface PrescriptionRepository {
  createForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription>;

  getById(rxId: RxId): Promise<Prescription | null>;

  listByVisit(visitId: string): Promise<Prescription[]>;
}

export class DynamoDBPrescriptionRepository implements PrescriptionRepository {
  async createForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription> {
    const { visit, lines, jsonKey } = params;

    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `VISIT#${visit.visitId}`,
          ':skPrefix': 'RX#',
        },
      }),
    );

    const existing = (Items ?? []) as Array<{ version?: number }>;
    const maxVersion = existing.reduce((max, item) => {
      if (typeof item.version === 'number') {
        return item.version > max ? item.version : max;
      }
      return max;
    }, 0);

    const version = maxVersion + 1;
    const now = Date.now();
    const rxId = randomUUID();

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      doctorId: visit.doctorId,
      lines,
      version,
      jsonKey,
      createdAt: now,
      updatedAt: now,
    };

    const visitScopedItem = {
      ...buildVisitRxKey(visit.visitId, rxId),
      entityType: 'RX',
      patientId: visit.patientId,
      visitDate: visit.visitDate,
      ...base,
    };

    const rxMetaItem = {
      ...buildRxMetaKey(rxId),
      entityType: 'RX',
      patientId: visit.patientId,
      visitDate: visit.visitDate,
      ...base,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: visitScopedItem,
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: rxMetaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );

    return base;
  }

  async getById(rxId: RxId): Promise<Prescription | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildRxMetaKey(rxId),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'RX') return null;
    return Item as Prescription;
  }

  async listByVisit(visitId: string): Promise<Prescription[]> {
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `VISIT#${visitId}`,
          ':skPrefix': 'RX#',
        },
        ScanIndexForward: true,
      }),
    );

    if (!Items || Items.length === 0) return [];
    const prescriptions = Items as Prescription[];
    return prescriptions.slice().sort((a, b) => a.version - b.version);
  }
}

export const prescriptionRepository: PrescriptionRepository = new DynamoDBPrescriptionRepository();
