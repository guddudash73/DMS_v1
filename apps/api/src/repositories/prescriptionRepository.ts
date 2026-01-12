// apps/api/src/repositories/prescriptionRepository.ts
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

const getNumberProp = (v: unknown, key: string): number | undefined =>
  isObject(v) && typeof v[key] === 'number' ? (v[key] as number) : undefined;

/**
 * ✅ Idempotent Rx IDs to prevent duplicates under concurrency:
 * - v1: `${visitId}#v1`
 * - v2: `${visitId}#v2`
 *
 * This keeps your existing API behavior while eliminating duplicate v2 rows when two requests race.
 */
const rxIdFor = (visitId: string, version: 1 | 2) => `${visitId}#v${version}` as RxId;

export interface PrescriptionRepository {
  /** Option 2: draft stays version=1 and is overwritten (stable jsonKey) */
  upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
    doctorNotes?: Prescription['doctorNotes'];
  }): Promise<Prescription>;

  /** Option 2: create revision ONCE (version=2) and then overwrite it */
  ensureRevisionForVisit(params: { visit: Visit; jsonKey: string }): Promise<Prescription>;

  updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
    doctorNotes?: Prescription['doctorNotes'];
  }): Promise<Prescription | null>;

  updateReceptionNotesById(params: {
    rxId: RxId;
    receptionNotes: string;
  }): Promise<Prescription | null>;

  getById(rxId: RxId): Promise<Prescription | null>;
  listByVisit(visitId: string): Promise<Prescription[]>;
  getCurrentForVisit(visitId: string): Promise<Prescription | null>;

  /** NEW: fetch a specific version (for dropdown selection) */
  getByVisitAndVersion(visitId: string, version: number): Promise<Prescription | null>;

  /** NEW: used by visits route to decide draft vs revision */
  getCurrentMetaForVisit(
    visitId: string,
  ): Promise<{ currentRxId: string | null; currentRxVersion: number | null }>;
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

  async getByVisitAndVersion(visitId: string, version: number): Promise<Prescription | null> {
    // list size should remain small; this avoids needing extra indexes
    const all = await this.listByVisit(visitId);
    return all.find((p) => p.version === version) ?? null;
  }

  async getCurrentMetaForVisit(visitId: string) {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKey(visitId),
        ConsistentRead: true,
      }),
    );

    const currentRxId = getStringProp(Item, 'currentRxId') ?? null;
    const currentRxVersion = getNumberProp(Item, 'currentRxVersion') ?? null;

    return { currentRxId, currentRxVersion };
  }

  async getCurrentForVisit(visitId: string): Promise<Prescription | null> {
    const { currentRxId } = await this.getCurrentMetaForVisit(visitId);
    if (!currentRxId) return null;
    return this.getById(currentRxId);
  }

  async upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
    doctorNotes?: Prescription['doctorNotes'];
  }): Promise<Prescription> {
    const { visit, lines, jsonKey, toothDetails, doctorNotes } = params;

    // ✅ deterministic v1 id prevents duplicates
    const rxId = rxIdFor(visit.visitId, 1);

    // if it already exists, overwrite via update
    const existing = await this.getById(rxId);
    if (existing) {
      const updated = await this.updateById({
        rxId,
        lines,
        jsonKey,
        toothDetails,
        doctorNotes,
      });
      return updated ?? existing;
    }

    // ✅ create FIRST version only (idempotent with conditional puts)
    const now = Date.now();
    const version = 1 as const;

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

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: visitScopedItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
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
    } catch (err) {
      // If a race created it first, return the winner
      const raced = await this.getById(rxId);
      if (raced) return raced;
      throw err;
    }
  }

  async ensureRevisionForVisit(params: { visit: Visit; jsonKey: string }): Promise<Prescription> {
    const { visit, jsonKey } = params;

    // ✅ deterministic v2 id prevents duplicates
    const rxId = rxIdFor(visit.visitId, 2);

    // If already exists, return it
    const already = await this.getById(rxId);
    if (already) return already;

    const now = Date.now();
    const version = 2 as const;

    // copy from v1 if present (prefer version 1)
    const v1 = await this.getById(rxIdFor(visit.visitId, 1));

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      lines: v1?.lines ?? [],
      version,
      jsonKey,
      ...(v1?.toothDetails !== undefined ? { toothDetails: v1.toothDetails } : {}),
      ...(v1?.doctorNotes !== undefined ? { doctorNotes: v1.doctorNotes } : {}),
      receptionNotes: v1?.receptionNotes,
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

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: visitScopedItem,
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
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
    } catch (err) {
      // If a race created it first, return the winner
      const raced = await this.getById(rxId);
      if (raced) return raced;
      throw err;
    }
  }

  async updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
    doctorNotes?: Prescription['doctorNotes'];
  }): Promise<Prescription | null> {
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

  async updateReceptionNotesById(params: {
    rxId: RxId;
    receptionNotes: string;
  }): Promise<Prescription | null> {
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
