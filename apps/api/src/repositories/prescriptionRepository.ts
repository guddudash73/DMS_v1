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
} from '@dcm/types';

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

const rxIdFor = (visitId: string, version: 1 | 2) => `${visitId}#v${version}` as RxId;

export interface PrescriptionRepository {
  upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];

    // ✅ printable (prints on prescription)
    doctorNotes?: Prescription['doctorNotes'];

    // ✅ non-printable internal (doctor -> reception)
    doctorReceptionNotes?: Prescription['doctorReceptionNotes'];
  }): Promise<Prescription>;

  ensureRevisionForVisit(params: { visit: Visit; jsonKey: string }): Promise<Prescription>;

  updateById(params: {
    rxId: RxId;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];

    // ✅ printable
    doctorNotes?: Prescription['doctorNotes'];

    // ✅ non-printable
    doctorReceptionNotes?: Prescription['doctorReceptionNotes'];
  }): Promise<Prescription | null>;

  updateReceptionNotesById(params: {
    rxId: RxId;
    receptionNotes: string;
  }): Promise<Prescription | null>;

  getById(rxId: RxId): Promise<Prescription | null>;
  listByVisit(visitId: string): Promise<Prescription[]>;
  getCurrentForVisit(visitId: string): Promise<Prescription | null>;
  getByVisitAndVersion(visitId: string, version: number): Promise<Prescription | null>;
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

    // ✅ printable
    doctorNotes?: Prescription['doctorNotes'];

    // ✅ non-printable
    doctorReceptionNotes?: Prescription['doctorReceptionNotes'];
  }): Promise<Prescription> {
    const { visit, lines, jsonKey, toothDetails, doctorNotes, doctorReceptionNotes } = params;

    const rxId = rxIdFor(visit.visitId, 1);
    const existing = await this.getById(rxId);

    if (existing) {
      const updated = await this.updateById({
        rxId,
        lines,
        jsonKey,
        toothDetails,
        doctorNotes,
        doctorReceptionNotes,
      });
      return updated ?? existing;
    }

    const now = Date.now();
    const version = 1 as const;

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      lines,
      version,
      jsonKey,
      ...(toothDetails !== undefined ? { toothDetails } : {}),

      // ✅ printable
      ...(doctorNotes !== undefined ? { doctorNotes } : {}),

      // ✅ non-printable
      ...(doctorReceptionNotes !== undefined ? { doctorReceptionNotes } : {}),

      // receptionist printable notes remain separate
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
      const raced = await this.getById(rxId);
      if (raced) return raced;
      throw err;
    }
  }

  async ensureRevisionForVisit(params: { visit: Visit; jsonKey: string }): Promise<Prescription> {
    const { visit, jsonKey } = params;

    const rxId = rxIdFor(visit.visitId, 2);
    const already = await this.getById(rxId);
    if (already) return already;

    const now = Date.now();
    const version = 2 as const;

    const v1 = await this.getById(rxIdFor(visit.visitId, 1));

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      lines: v1?.lines ?? [],
      version,
      jsonKey,
      ...(v1?.toothDetails !== undefined ? { toothDetails: v1.toothDetails } : {}),

      // ✅ printable carry-forward
      ...(v1?.doctorNotes !== undefined ? { doctorNotes: v1.doctorNotes } : {}),

      // ✅ non-printable carry-forward
      ...(v1?.doctorReceptionNotes !== undefined
        ? { doctorReceptionNotes: v1.doctorReceptionNotes }
        : {}),

      // ✅ receptionist printable notes carry-forward (unchanged)
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

    // ✅ printable
    doctorNotes?: Prescription['doctorNotes'];

    // ✅ non-printable
    doctorReceptionNotes?: Prescription['doctorReceptionNotes'];
  }): Promise<Prescription | null> {
    const { rxId, lines, jsonKey, toothDetails, doctorNotes, doctorReceptionNotes } = params;

    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();

    const hasToothDetails = toothDetails !== undefined;

    const hasDoctorNotes = doctorNotes !== undefined; // printable
    const hasDoctorReceptionNotes = doctorReceptionNotes !== undefined; // non-printable

    const next: Prescription = {
      ...existing,
      lines,
      jsonKey,
      ...(hasToothDetails ? { toothDetails } : {}),
      ...(hasDoctorNotes ? { doctorNotes } : {}),
      ...(hasDoctorReceptionNotes ? { doctorReceptionNotes } : {}),
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

    if (hasDoctorReceptionNotes) {
      setParts.push('#doctorReceptionNotes = :drn');
      names['#doctorReceptionNotes'] = 'doctorReceptionNotes';
      values[':drn'] = doctorReceptionNotes;
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
