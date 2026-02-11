// apps/api/src/repositories/visitRepository.ts
import { randomUUID, createHash } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { Visit, VisitCreate, VisitStatus, VisitQueueQuery, VisitTag } from '@dcm/types';
import { clinicDateISOFromMs } from '../lib/date';

export class InvalidStatusTransitionError extends Error {
  readonly code = 'INVALID_STATUS_TRANSITION' as const;
  readonly statusCode = 409 as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class VisitCreateRuleViolationError extends Error {
  readonly code = 'VISIT_CREATE_RULE_VIOLATION' as const;
  readonly statusCode = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = 'VisitCreateRuleViolationError';
  }
}

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const buildPatientVisitKeys = (patientId: string, visitId: string) => ({
  PK: `PATIENT#${patientId}`,
  SK: `VISIT#${visitId}`,
});

const buildVisitMetaKeys = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'META',
});

const clinicDateKeyFromMs = (timestampMs: number): string => clinicDateISOFromMs(timestampMs);

const buildGsi3Keys = (date: string, visitId: string) => ({
  GSI3PK: `DATE#${date}`,
  GSI3SK: `TYPE#VISIT#ID#${visitId}`,
});

const buildOpdDailyCounterKey = (visitDate: string) => ({
  PK: `COUNTER#OPD#${visitDate}`,
  SK: 'META',
});

const buildOpdTagCounterKey = (visitDate: string, tag: VisitTag) => ({
  PK: `COUNTER#OPD_TAG#${visitDate}#${tag}`,
  SK: 'META',
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const getStringProp = (v: unknown, key: string): string | null => {
  if (!isRecord(v)) return null;
  const val = v[key];
  return typeof val === 'string' ? val : null;
};

async function nextCounter(key: { PK: string; SK: string }): Promise<number> {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: key,
      UpdateExpression: 'ADD #last :inc SET #updatedAt = :now',
      ExpressionAttributeNames: {
        '#last': 'last',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':inc': 1,
        ':now': Date.now(),
      },
      ReturnValues: 'UPDATED_NEW',
    }),
  );

  const last = (Attributes?.last as number | undefined) ?? 0;
  return Number(last);
}

function tagLabel(tag: VisitTag | undefined): string {
  if (tag === 'F') return 'FU';
  return 'NEW';
}

/**
 * ✅ OPD format update:
 * Was: YY/MM/DD/...
 * Now: DD/MM/YYYY/...
 *
 * visitDate is expected to be "YYYY-MM-DD".
 */
function formatOpdNo(
  visitDate: string,
  dailySeq: number,
  tag: VisitTag | undefined,
  tagSeq: number,
) {
  const yyyy = visitDate.slice(0, 4);
  const mm = visitDate.slice(5, 7);
  const dd = visitDate.slice(8, 10);

  const a = String(dailySeq).padStart(2, '0');
  const b = String(tagSeq).padStart(2, '0');

  return `${dd}/${mm}/${yyyy}/${a}/${tagLabel(tag)}/${b}`;
}

export interface VisitRepository {
  create(input: VisitCreate, opts?: { idempotencyKey?: string }): Promise<Visit>;
  getById(visitId: string): Promise<Visit | null>;
  listByPatientId(patientId: string): Promise<Visit[]>;
  updateStatus(visitId: string, nextStatus: VisitStatus): Promise<Visit | null>;
  getPatientQueue(params: VisitQueueQuery): Promise<Visit[]>;
  listByDate(date: string): Promise<Visit[]>;

  setCurrentRxPointer(params: {
    visitId: string;
    patientId: string;
    rxId: string;
    version: number;
  }): Promise<void>;

  setVisitAssistant(params: {
    visitId: string;
    assistantId: string | null;
    assistantName: string | null;
  }): Promise<Visit | null>;

  /**
   * ✅ NEW: Atomic update for status + assistant snapshot (all-or-nothing).
   * - assistantId undefined => don't change assistant fields
   * - assistantId null => clear assistant fields
   * - assistantId string => set assistant fields (caller should validate)
   */
  updateStatusWithAssistant(params: {
    visitId: string;
    nextStatus: VisitStatus;
    assistantId?: string | null;
    assistantName?: string | null;
  }): Promise<Visit | null>;
}

export class DynamoDBVisitRepository implements VisitRepository {
  private isValidTransition(from: VisitStatus, to: VisitStatus, isOffline: boolean): boolean {
    if (from === 'QUEUED' && to === 'IN_PROGRESS') return true;
    if (from === 'IN_PROGRESS' && to === 'DONE') return true;
    if (isOffline && from === 'QUEUED' && to === 'DONE') return true;

    return false;
  }

  async create(input: VisitCreate, opts?: { idempotencyKey?: string }): Promise<Visit> {
    const now = Date.now();
    const idemKeyRaw = opts?.idempotencyKey?.trim();
    const idemKey = idemKeyRaw && idemKeyRaw.length > 0 ? idemKeyRaw : undefined;

    const idempotencyPk = idemKey ? `IDEMPOTENCY#VISIT_CREATE#${idemKey}` : undefined;
    const idempotencyDdbKey = idempotencyPk ? { PK: idempotencyPk, SK: 'META' } : undefined;

    const inputHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');

    if (idempotencyDdbKey) {
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: idempotencyDdbKey,
          ConsistentRead: true,
        }),
      );

      const prevVisitId = getStringProp(Item, 'visitId');
      const prevHash = getStringProp(Item, 'inputHash');

      if (prevVisitId) {
        if (prevHash && prevHash !== inputHash) {
          throw new VisitCreateRuleViolationError(
            'Idempotency-Key reused with different request payload',
          );
        }

        const existingVisit = await this.getById(prevVisitId);
        if (existingVisit) return existingVisit;
      }
    }

    const visitId = randomUUID();
    const visitDate = clinicDateKeyFromMs(now);

    const status: VisitStatus = 'QUEUED';
    const tag: VisitTag | undefined = input.tag;

    if (tag === 'F') {
      const anchorId = input.anchorVisitId;
      if (!anchorId) {
        throw new VisitCreateRuleViolationError('anchorVisitId is required when tag is F');
      }

      const anchor = await this.getById(anchorId);
      if (!anchor) {
        throw new VisitCreateRuleViolationError('anchorVisitId does not exist');
      }

      if (anchor.patientId !== input.patientId) {
        throw new VisitCreateRuleViolationError('anchorVisitId must belong to the same patient');
      }

      if (anchor.tag && anchor.tag !== 'N') {
        throw new VisitCreateRuleViolationError('anchorVisitId must point to an N (new) visit');
      }
    }

    const tagForCounter: VisitTag = tag ?? 'N';

    const dailySeq = await nextCounter(buildOpdDailyCounterKey(visitDate));
    const tagSeq = await nextCounter(buildOpdTagCounterKey(visitDate, tagForCounter));
    const opdNo = formatOpdNo(visitDate, dailySeq, tagForCounter, tagSeq);

    const base: Visit = {
      visitId,
      patientId: input.patientId,
      reason: input.reason,
      status,
      visitDate,
      opdNo,
      dailyPatientNumber: dailySeq,
      checkedOut: false,
      checkedOutAt: undefined,
      createdAt: now,
      updatedAt: now,

      ...(tag ? { tag } : {}),
      ...(typeof input.zeroBilled === 'boolean' ? { zeroBilled: input.zeroBilled } : {}),
      ...(input.anchorVisitId ? { anchorVisitId: input.anchorVisitId } : {}),
      ...(typeof input.isOffline === 'boolean' ? { isOffline: input.isOffline } : {}),
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
      ...buildGsi3Keys(visitDate, visitId),
    };

    const idemItem = idempotencyDdbKey
      ? {
          ...idempotencyDdbKey,
          entityType: 'IDEMPOTENCY',
          kind: 'VISIT_CREATE',
          visitId,
          inputHash,
          createdAt: now,
        }
      : null;

    try {
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
            ...(idemItem
              ? [
                  {
                    Put: {
                      TableName: TABLE_NAME,
                      Item: idemItem,
                      ConditionExpression: 'attribute_not_exists(PK)',
                    },
                  },
                ]
              : []),
          ],
        }),
      );

      return base;
    } catch (err) {
      if (idempotencyDdbKey) {
        const { Item } = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: idempotencyDdbKey,
            ConsistentRead: true,
          }),
        );

        const winnerVisitId = getStringProp(Item, 'visitId');

        if (winnerVisitId) {
          const existingVisit = await this.getById(winnerVisitId);
          if (existingVisit) return existingVisit;
        }
      }
      throw err;
    }
  }

  async getById(visitId: string): Promise<Visit | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKeys(visitId),
        ConsistentRead: true,
      }),
    );

    if (!Item || (Item as { entityType?: string }).entityType !== 'VISIT') return null;
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

    type VisitWithOffline = Visit & { isOffline?: boolean };
    const isOffline = (current as VisitWithOffline).isOffline === true;

    if (!this.isValidTransition(current.status, nextStatus, isOffline)) {
      throw new InvalidStatusTransitionError(
        `Invalid status transition ${current.status} -> ${nextStatus}`,
      );
    }

    const now = Date.now();
    const metaKey = buildVisitMetaKeys(visitId);

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: metaKey,
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': nextStatus,
          ':updatedAt': now,
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

  async getPatientQueue(params: VisitQueueQuery): Promise<Visit[]> {
    const { date, status } = params;

    const todayClinic = clinicDateKeyFromMs(Date.now());
    const queryDate = date ?? todayClinic;

    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `DATE#${queryDate}`,
          ':skPrefix': 'TYPE#VISIT#ID#',
        },
        ScanIndexForward: true,
      }),
    );

    const visits = (Items ?? []) as Visit[];
    const filtered = status ? visits.filter((v) => v.status === status) : visits;

    filtered.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return filtered;
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

  async setCurrentRxPointer(params: {
    visitId: string;
    patientId: string;
    rxId: string;
    version: number;
  }): Promise<void> {
    const now = Date.now();

    const metaKey = buildVisitMetaKeys(params.visitId);
    const patientVisitKey = buildPatientVisitKeys(params.patientId, params.visitId);

    const condition =
      'attribute_exists(PK) AND (attribute_not_exists(#currentRxVersion) OR :version >= #currentRxVersion)';

    const names = {
      '#currentRxId': 'currentRxId',
      '#currentRxVersion': 'currentRxVersion',
      '#currentRxUpdatedAt': 'currentRxUpdatedAt',
      '#updatedAt': 'updatedAt',
    };

    const values = {
      ':rxId': params.rxId,
      ':version': params.version,
      ':now': now,
    };

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE_NAME,
                Key: metaKey,
                UpdateExpression:
                  'SET #currentRxId = :rxId, #currentRxVersion = :version, #currentRxUpdatedAt = :now, #updatedAt = :now',
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
                ConditionExpression: condition,
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: patientVisitKey,
                UpdateExpression:
                  'SET #currentRxId = :rxId, #currentRxVersion = :version, #currentRxUpdatedAt = :now, #updatedAt = :now',
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch {
      // keep existing behavior: ignore contention, do not throw
      return;
    }
  }

  async setVisitAssistant(params: {
    visitId: string;
    assistantId: string | null;
    assistantName: string | null;
  }): Promise<Visit | null> {
    const current = await this.getById(params.visitId);
    if (!current) return null;

    const now = Date.now();

    const names = {
      '#assistantId': 'assistantId',
      '#assistantName': 'assistantName',
      '#updatedAt': 'updatedAt',
    };

    const values: Record<string, unknown> = {
      ':updatedAt': now,
      ':assistantId': params.assistantId,
      ':assistantName': params.assistantName,
    };

    const metaUpdate =
      params.assistantId === null
        ? 'REMOVE #assistantId, #assistantName SET #updatedAt = :updatedAt'
        : 'SET #assistantId = :assistantId, #assistantName = :assistantName, #updatedAt = :updatedAt';

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildVisitMetaKeys(params.visitId),
        UpdateExpression: metaUpdate,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildPatientVisitKeys(current.patientId, params.visitId),
        UpdateExpression: metaUpdate,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    return (Attributes ?? null) as Visit | null;
  }

  async updateStatusWithAssistant(params: {
    visitId: string;
    nextStatus: VisitStatus;
    assistantId?: string | null;
    assistantName?: string | null;
  }): Promise<Visit | null> {
    const current = await this.getById(params.visitId);
    if (!current) return null;

    type VisitWithOffline = Visit & { isOffline?: boolean };
    const isOffline = (current as VisitWithOffline).isOffline === true;

    if (!this.isValidTransition(current.status, params.nextStatus, isOffline)) {
      throw new InvalidStatusTransitionError(
        `Invalid status transition ${current.status} -> ${params.nextStatus}`,
      );
    }

    const now = Date.now();

    const metaKey = buildVisitMetaKeys(params.visitId);
    const patientKey = buildPatientVisitKeys(current.patientId, params.visitId);

    const hasAssistantKey = Object.prototype.hasOwnProperty.call(params, 'assistantId');

    const shouldClearAssistant = hasAssistantKey && params.assistantId === null;
    const shouldSetAssistant = hasAssistantKey && typeof params.assistantId === 'string';

    const names: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
      ...(hasAssistantKey
        ? {
            '#assistantId': 'assistantId',
            '#assistantName': 'assistantName',
          }
        : {}),
    };

    const values: Record<string, unknown> = {
      ':status': params.nextStatus,
      ':now': now,
      ':expectedStatus': current.status,
      ...(shouldSetAssistant
        ? {
            ':assistantId': params.assistantId,
            ':assistantName': params.assistantName ?? null,
          }
        : {}),
    };

    let metaUpdate = 'SET #status = :status, #updatedAt = :now';
    let patientUpdate = 'SET #status = :status, #updatedAt = :now';

    if (shouldClearAssistant) {
      metaUpdate = `${metaUpdate} REMOVE #assistantId, #assistantName`;
      patientUpdate = `${patientUpdate} REMOVE #assistantId, #assistantName`;
    } else if (shouldSetAssistant) {
      metaUpdate =
        'SET #status = :status, #assistantId = :assistantId, #assistantName = :assistantName, #updatedAt = :now';
      patientUpdate =
        'SET #status = :status, #assistantId = :assistantId, #assistantName = :assistantName, #updatedAt = :now';
    }

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: metaKey,
              UpdateExpression: metaUpdate,
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
              ConditionExpression: 'attribute_exists(PK) AND #status = :expectedStatus',
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: patientKey,
              UpdateExpression: patientUpdate,
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
              ConditionExpression: 'attribute_exists(PK) AND #status = :expectedStatus',
            },
          },
        ],
      }),
    );

    return await this.getById(params.visitId);
  }
}

export const visitRepository: VisitRepository = new DynamoDBVisitRepository();
