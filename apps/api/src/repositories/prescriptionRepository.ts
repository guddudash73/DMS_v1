// apps/api/src/repositories/prescriptionRepository.ts
import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import {
  Prescription as PrescriptionSchema, // ✅ zod schema
  type Visit,
  type Prescription,
  type RxId,
  type RxLineType,
} from '@dms/types';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const buildVisitRxKey = (visitId: string, rxId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: `RX#${rxId}`,
});

const buildRxMetaKey = (rxId: string) => ({
  PK: `RX#${rxId}`,
  SK: 'META',
});

const buildVisitMetaKey = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'META',
});

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const getStringProp = (v: unknown, key: string): string | undefined =>
  isObject(v) && typeof v[key] === 'string' ? (v[key] as string) : undefined;

export interface PrescriptionRepository {
  upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription>;
  createNewVersionForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription>;
  updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
  }): Promise<Prescription | null>;

  updateReceptionNotesById(params: {
    rxId: RxId;
    receptionNotes: string;
  }): Promise<Prescription | null>;

  getById(rxId: RxId): Promise<Prescription | null>;
  listByVisit(visitId: string): Promise<Prescription[]>;
  getCurrentForVisit(visitId: string): Promise<Prescription | null>;
}

export class DynamoDBPrescriptionRepository implements PrescriptionRepository {
  async getById(rxId: RxId): Promise<Prescription | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildRxMetaKey(rxId),
        ConsistentRead: true,
      }),
    );

    if (!Item) return null;

    const parsed = PrescriptionSchema.safeParse(Item);
    if (!parsed.success) return null;

    return parsed.data;
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

    const parsed = Items.map((it) => PrescriptionSchema.safeParse(it))
      .filter((r): r is { success: true; data: Prescription } => r.success)
      .map((r) => r.data);

    return parsed.slice().sort((a, b) => a.version - b.version);
  }

  async getCurrentForVisit(visitId: string): Promise<Prescription | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visitId),
        ConsistentRead: true,
      }),
    );

    const currentRxId = getStringProp(Item, 'currentRxId');
    if (!currentRxId) return null;

    return this.getById(currentRxId);
  }

  async upsertDraftForVisit(params: { visit: Visit; lines: RxLineType[]; jsonKey: string }) {
    const { visit, lines, jsonKey } = params;

    const { Item: visitMeta } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visit.visitId),
        ConsistentRead: true,
      }),
    );

    const currentRxId = getStringProp(visitMeta, 'currentRxId');

    if (currentRxId) {
      const updated = await this.updateById({ rxId: currentRxId, lines, jsonKey });
      if (updated) return updated;
    }

    const now = Date.now();
    const rxId = randomUUID();
    const version = 1;

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      doctorId: visit.doctorId,
      lines,
      version,
      jsonKey,
      receptionNotes: undefined,
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
          { Put: { TableName: TABLE_NAME, Item: visitScopedItem } },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: rxMetaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitMetaKey(visit.visitId),
              UpdateExpression: 'SET #currentRxId = :rxId, #currentRxVersion = :v, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#currentRxId': 'currentRxId',
                '#currentRxVersion': 'currentRxVersion',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':rxId': rxId,
                ':v': version,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(#currentRxId)',
            },
          },
        ],
      }),
    );

    return base;
  }

  async createNewVersionForVisit(params: { visit: Visit; lines: RxLineType[]; jsonKey: string }) {
    const { visit, lines, jsonKey } = params;

    const existing = await this.listByVisit(visit.visitId);
    const maxVersion = existing.reduce((m, p) => (p.version > m ? p.version : m), 0);
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
      receptionNotes: undefined,
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
          { Put: { TableName: TABLE_NAME, Item: visitScopedItem } },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: rxMetaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitMetaKey(visit.visitId),
              UpdateExpression: 'SET #currentRxId = :rxId, #currentRxVersion = :v, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#currentRxId': 'currentRxId',
                '#currentRxVersion': 'currentRxVersion',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':rxId': rxId,
                ':v': version,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return base;
  }

  async updateById(params: { rxId: RxId; lines: RxLineType[]; jsonKey: string }) {
    const { rxId, lines, jsonKey } = params;
    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();
    const next: Prescription = {
      ...existing,
      lines,
      jsonKey,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildRxMetaKey(rxId),
              UpdateExpression: 'SET #lines = :l, #jsonKey = :j, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#lines': 'lines',
                '#jsonKey': 'jsonKey',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':l': lines,
                ':j': jsonKey,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitRxKey(existing.visitId, rxId),
              UpdateExpression: 'SET #lines = :l, #jsonKey = :j, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#lines': 'lines',
                '#jsonKey': 'jsonKey',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':l': lines,
                ':j': jsonKey,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return next;
  }

  async updateReceptionNotesById(params: { rxId: RxId; receptionNotes: string }) {
    const { rxId, receptionNotes } = params;
    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();
    const next: Prescription = {
      ...existing,
      receptionNotes,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildRxMetaKey(rxId),
              UpdateExpression: 'SET #receptionNotes = :n, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#receptionNotes': 'receptionNotes',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':n': receptionNotes,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitRxKey(existing.visitId, rxId),
              UpdateExpression: 'SET #receptionNotes = :n, #updatedAt = :u',
              ExpressionAttributeNames: {
                '#receptionNotes': 'receptionNotes',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':n': receptionNotes,
                ':u': now,
              },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return next;
  }
}

export const prescriptionRepository: PrescriptionRepository = new DynamoDBPrescriptionRepository();
