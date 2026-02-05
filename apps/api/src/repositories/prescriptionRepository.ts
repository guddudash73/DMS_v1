// apps/api/src/repositories/prescriptionRepository.ts
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import {
  Prescription as PrescriptionSchema,
  type Visit,
  type Prescription,
  type RxId,
  type RxLineType,
  ToothDetail,
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

/**
 * ✅ Allow toothDetails without position/toothNumbers (per latest types),
 * but prevent saving a completely empty tooth detail object.
 */
const ToothDetailLoose = ToothDetail.superRefine((d, ctx) => {
  const hasToothNumbers = (d.toothNumbers?.length ?? 0) > 0;
  const hasText =
    !!d.notes?.trim() || !!d.diagnosis?.trim() || !!d.advice?.trim() || !!d.procedure?.trim();

  if (!hasToothNumbers && !hasText) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tooth detail must include tooth numbers or notes/diagnosis/advice/procedure.',
      path: ['toothNumbers'],
    });
  }
});

const ToothDetailsArrayLoose = z.array(ToothDetailLoose);

function normalizeToothDetails(
  input: Prescription['toothDetails'] | undefined,
): Prescription['toothDetails'] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return undefined;

  // Normalize + drop fully-empty rows (and trim strings)
  const cleaned = input
    .map((raw) => {
      const d: any = raw ?? {};

      const toothNumbers = Array.isArray(d.toothNumbers)
        ? d.toothNumbers.map((x: any) => String(x).trim()).filter(Boolean)
        : undefined;

      const notes = typeof d.notes === 'string' ? d.notes.trim() : undefined;
      const diagnosis = typeof d.diagnosis === 'string' ? d.diagnosis.trim() : undefined;
      const advice = typeof d.advice === 'string' ? d.advice.trim() : undefined;
      const procedure = typeof d.procedure === 'string' ? d.procedure.trim() : undefined;

      // position is optional now, but if provided, keep it
      const position = typeof d.position === 'string' && d.position.trim() ? d.position : undefined;

      const blockId =
        typeof d.blockId === 'string' && d.blockId.trim() ? d.blockId.trim() : undefined;

      const hasToothNumbers = (toothNumbers?.length ?? 0) > 0;
      const hasText = !!notes || !!diagnosis || !!advice || !!procedure;

      if (!hasToothNumbers && !hasText) return null;

      return {
        ...(blockId ? { blockId } : {}),
        ...(position ? { position } : {}),
        ...(hasToothNumbers ? { toothNumbers } : {}),
        ...(notes ? { notes } : {}),
        ...(diagnosis ? { diagnosis } : {}),
        ...(advice ? { advice } : {}),
        ...(procedure ? { procedure } : {}),
      } as any;
    })
    .filter(Boolean);

  if (cleaned.length === 0) return [];

  // Validate shape according to latest zod schema (+ our non-empty rule)
  const parsed = ToothDetailsArrayLoose.safeParse(cleaned);
  if (!parsed.success) {
    // If you prefer hard-fail instead of silently dropping invalid rows,
    // throw with details to surface bug quickly.
    throw new Error(
      `Invalid toothDetails payload: ${parsed.error.issues.map((i) => i.message).join(' | ')}`,
    );
  }

  return parsed.data as any;
}

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
    return this.getById(currentRxId as RxId);
  }

  async upsertDraftForVisit(params: {
    visit: Visit;
    lines: RxLineType[];
    jsonKey: string;
    toothDetails?: Prescription['toothDetails'];
    doctorNotes?: Prescription['doctorNotes'];
    doctorReceptionNotes?: Prescription['doctorReceptionNotes'];
  }): Promise<Prescription> {
    const { visit, lines, jsonKey, doctorNotes, doctorReceptionNotes } = params;

    const rxId = rxIdFor(visit.visitId, 1);
    const existing = await this.getById(rxId);

    // ✅ normalize tooth details (allow missing position/toothNumbers)
    const toothDetails = normalizeToothDetails(params.toothDetails);

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
      ...(doctorNotes !== undefined ? { doctorNotes } : {}),
      ...(doctorReceptionNotes !== undefined ? { doctorReceptionNotes } : {}),
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

    // carry-forward: toothDetails is already in DB shape; still normalize defensively
    const carriedToothDetails = normalizeToothDetails(v1?.toothDetails);

    const base: Prescription = {
      rxId,
      visitId: visit.visitId,
      lines: v1?.lines ?? [],
      version,
      jsonKey,
      ...(carriedToothDetails !== undefined ? { toothDetails: carriedToothDetails } : {}),
      ...(v1?.doctorNotes !== undefined ? { doctorNotes: v1.doctorNotes } : {}),
      ...(v1?.doctorReceptionNotes !== undefined
        ? { doctorReceptionNotes: v1.doctorReceptionNotes }
        : {}),
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
    doctorNotes?: Prescription['doctorNotes'];
    doctorReceptionNotes?: Prescription['doctorReceptionNotes'];
  }): Promise<Prescription | null> {
    const { rxId, lines, jsonKey, doctorNotes, doctorReceptionNotes } = params;

    const existing = await this.getById(rxId);
    if (!existing) return null;

    const now = Date.now();

    const hasDoctorNotes = doctorNotes !== undefined;
    const hasDoctorReceptionNotes = doctorReceptionNotes !== undefined;

    // ✅ normalize toothDetails (and validate non-empty rows)
    const normalizedToothDetails =
      params.toothDetails !== undefined ? normalizeToothDetails(params.toothDetails) : undefined;
    const hasToothDetails = params.toothDetails !== undefined;

    const next: Prescription = {
      ...existing,
      lines,
      jsonKey,
      ...(hasToothDetails ? { toothDetails: normalizedToothDetails } : {}),
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
      values[':t'] = normalizedToothDetails;
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
