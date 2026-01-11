import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import {
  Prescription as PrescriptionSchema,
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
    toothDetails?: Prescription['toothDetails'];

    // ✅ NEW
    doctorNotes?: Prescription['doctorNotes'];
  }): Promise<Prescription>;

  createNewVersionForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];

    // ✅ NEW
    doctorNotes?: Prescription['doctorNotes'];
  }): Promise<Prescription>;

  updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];

    // ✅ NEW
    doctorNotes?: Prescription['doctorNotes'];
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
    doctorNotes?: Prescription['doctorNotes'];
  }) {
    const { visit, lines, jsonKey, toothDetails, doctorNotes } = params;

    const { Item: visitMeta } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visit.visitId),
        ConsistentRead: true,
      }),
    );

    const currentRxId = getStringProp(visitMeta, 'currentRxId');

    if (currentRxId) {
      const updated = await this.updateById({
        rxId: currentRxId,
        lines,
        jsonKey,
        toothDetails,
        doctorNotes,
      });
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

      ...(toothDetails !== undefined ? { toothDetails } : {}),
      ...(doctorNotes !== undefined ? { doctorNotes } : {}),

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
    doctorNotes?: Prescription['doctorNotes'];
  }) {
    const { visit, lines, jsonKey, toothDetails, doctorNotes } = params;

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

      ...(toothDetails !== undefined ? { toothDetails } : {}),
      ...(doctorNotes !== undefined ? { doctorNotes } : {}),

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
    doctorNotes?: Prescription['doctorNotes'];
  }) {
    const { rxId, lines, jsonKey, toothDetails, doctorNotes } = params;

    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();

    const hasToothDetails = toothDetails !== undefined;
    const hasDoctorNotes = doctorNotes !== undefined;

    const next: Prescription = {
      ...existing,
      lines,
      jsonKey,
      ...(hasToothDetails ? { toothDetails } : {}),
      ...(hasDoctorNotes ? { doctorNotes } : {}),
      updatedAt: now,
    };

    const setParts: string[] = ['#lines = :l', '#jsonKey = :j', '#updatedAt = :u'];
    const names: Record<string, string> = {
      '#lines': 'lines',
      '#jsonKey': 'jsonKey',
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':l': lines,
      ':j': jsonKey,
      ':u': now,
    };

    if (hasToothDetails) {
      setParts.push('#toothDetails = :t');
      names['#toothDetails'] = 'toothDetails';
      values[':t'] = toothDetails;
    }

    if (hasDoctorNotes) {
      setParts.push('#doctorNotes = :dn');
      names['#doctorNotes'] = 'doctorNotes';
      values[':dn'] = doctorNotes;
    }

    const updateExpression = `SET ${setParts.join(', ')}`;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildRxMetaKey(rxId),
              UpdateExpression: updateExpression,
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: buildVisitRxKey(existing.visitId, rxId),
              UpdateExpression: updateExpression,
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
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
