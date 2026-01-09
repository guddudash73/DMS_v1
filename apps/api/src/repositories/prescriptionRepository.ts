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

    /**
     * ✅ NEW: visit-specific tooth details stored on prescription
     * (optional so existing callers don’t break)
     */
    toothDetails?: Prescription['toothDetails'];
  }): Promise<Prescription>;

  createNewVersionForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;

    /**
     * ✅ NEW: tooth details can be copied to the new version
     * (optional so callers can omit)
     */
    toothDetails?: Prescription['toothDetails'];
  }): Promise<Prescription>;

  updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;

    /**
     * ✅ NEW: if provided, updates toothDetails as well
     * If omitted (undefined), toothDetails is left unchanged.
     */
    toothDetails?: Prescription['toothDetails'];
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

  async upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
  }) {
    const { visit, lines, jsonKey, toothDetails } = params;

    const { Item: visitMeta } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visit.visitId),
        ConsistentRead: true,
      }),
    );

    const currentRxId = getStringProp(visitMeta, 'currentRxId');

    // If draft exists, update it (optionally includes toothDetails)
    if (currentRxId) {
      const updated = await this.updateById({ rxId: currentRxId, lines, jsonKey, toothDetails });
      if (updated) return updated;
    }

    const now = Date.now();
    const rxId = randomUUID();
    const version = 1;

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      lines,
      version,
      jsonKey,

      // ✅ NEW
      ...(toothDetails !== undefined ? { toothDetails } : {}),

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
              // ✅ Update works even if META doesn't exist (DDB will create it).
              // ✅ Also set createdAt once.
              UpdateExpression:
                'SET #currentRxId = :rxId, #currentRxVersion = :v, #updatedAt = :u, #createdAt = if_not_exists(#createdAt, :u)',
              ExpressionAttributeNames: {
                '#currentRxId': 'currentRxId',
                '#currentRxVersion': 'currentRxVersion',
                '#updatedAt': 'updatedAt',
                '#createdAt': 'createdAt',
              },
              ExpressionAttributeValues: {
                ':rxId': rxId,
                ':v': version,
                ':u': now,
              },
              // ✅ remove ConditionExpression entirely
            },
          },
        ],
      }),
    );

    return base;
  }

  async createNewVersionForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
  }) {
    const { visit, lines, jsonKey, toothDetails } = params;

    const existing = await this.listByVisit(visit.visitId);
    const maxVersion = existing.reduce((m, p) => (p.version > m ? p.version : m), 0);
    const version = maxVersion + 1;

    const now = Date.now();
    const rxId = randomUUID();

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      lines,
      version,
      jsonKey,

      // ✅ NEW
      ...(toothDetails !== undefined ? { toothDetails } : {}),

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
              UpdateExpression:
                'SET #currentRxId = :rxId, #currentRxVersion = :v, #updatedAt = :u, #createdAt = if_not_exists(#createdAt, :u)',
              ExpressionAttributeNames: {
                '#currentRxId': 'currentRxId',
                '#currentRxVersion': 'currentRxVersion',
                '#updatedAt': 'updatedAt',
                '#createdAt': 'createdAt',
              },
              ExpressionAttributeValues: {
                ':rxId': rxId,
                ':v': version,
                ':u': now,
              },
              // ✅ remove ConditionExpression
            },
          },
        ],
      }),
    );

    return base;
  }

  async updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
  }) {
    const { rxId, lines, jsonKey, toothDetails } = params;

    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();

    const hasToothDetails = toothDetails !== undefined;

    const next: Prescription = {
      ...existing,
      lines,
      jsonKey,
      ...(hasToothDetails ? { toothDetails } : {}),
      updatedAt: now,
    };

    const updateExpression = hasToothDetails
      ? 'SET #lines = :l, #jsonKey = :j, #toothDetails = :t, #updatedAt = :u'
      : 'SET #lines = :l, #jsonKey = :j, #updatedAt = :u';

    const expressionAttributeNames: Record<string, string> = {
      '#lines': 'lines',
      '#jsonKey': 'jsonKey',
      '#updatedAt': 'updatedAt',
      ...(hasToothDetails ? { '#toothDetails': 'toothDetails' } : {}),
    };

    const expressionAttributeValues: Record<string, unknown> = {
      ':l': lines,
      ':j': jsonKey,
      ':u': now,
      ...(hasToothDetails ? { ':t': toothDetails } : {}),
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildRxMetaKey(rxId),
              UpdateExpression: updateExpression,
              ExpressionAttributeNames: expressionAttributeNames,
              ExpressionAttributeValues: expressionAttributeValues,
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitRxKey(existing.visitId, rxId),
              UpdateExpression: updateExpression,
              ExpressionAttributeNames: expressionAttributeNames,
              ExpressionAttributeValues: expressionAttributeValues,
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
