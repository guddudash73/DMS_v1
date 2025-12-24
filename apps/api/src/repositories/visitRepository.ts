// apps/api/src/repositories/visitRepository.ts

import { randomUUID } from 'node:crypto';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { Visit, VisitCreate, VisitStatus, VisitQueueQuery, VisitTag } from '@dms/types';

export class InvalidStatusTransitionError extends Error {
  readonly code = 'INVALID_STATUS_TRANSITION' as const;
  readonly statusCode = 409 as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class DoctorBusyError extends Error {
  readonly code = 'DOCTOR_BUSY' as const;
  readonly statusCode = 409 as const;

  constructor(message = 'Doctor already has an in-progress visit for this date') {
    super(message);
    this.name = 'DoctorBusyError';
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

const buildDoctorDayLockKey = (doctorId: string, visitDate: string) => ({
  PK: `DOCTOR_DAY#${doctorId}#${visitDate}`,
  SK: 'IN_PROGRESS_LOCK',
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

  /**
   * Persist the “current” prescription pointer for a visit.
   *
   * - Updates VISIT meta item
   * - Updates PATIENT visit item (recommended for list views)
   * - Enforces monotonic version moves (won’t overwrite a newer pointer)
   */
  setCurrentRxPointer(params: {
    visitId: string;
    patientId: string;
    rxId: string;
    version: number;
  }): Promise<void>;
}

export class DynamoDBVisitRepository implements VisitRepository {
  private isValidTransition(from: VisitStatus, to: VisitStatus): boolean {
    if (from === 'QUEUED' && to === 'IN_PROGRESS') return true;
    if (from === 'IN_PROGRESS' && to === 'DONE') return true;
    return false;
  }

  async create(input: VisitCreate): Promise<Visit> {
    const now = Date.now();
    const visitId = randomUUID();
    const visitDate = toDateString(now);
    const status: VisitStatus = 'QUEUED';
    const tag: VisitTag | undefined = input.tag;

    const base: Visit = {
      visitId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      reason: input.reason,
      status,
      visitDate,
      createdAt: now,
      updatedAt: now,
      ...(tag ? { tag } : {}),
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

    if (!this.isValidTransition(current.status, nextStatus)) {
      throw new InvalidStatusTransitionError(
        `Invalid status transition ${current.status} -> ${nextStatus}`,
      );
    }

    const now = Date.now();
    const visitDate = current.visitDate;
    const doctorId = current.doctorId;

    const metaKey = buildVisitMetaKeys(visitId);
    const newQueueKeys = buildGsi2keys(doctorId, visitDate, nextStatus, now);

    const enteringInProgress = nextStatus === 'IN_PROGRESS';
    const leavingInProgress = current.status === 'IN_PROGRESS' && nextStatus !== 'IN_PROGRESS';
    const canLock = Boolean(doctorId && visitDate);

    if (!canLock || (!enteringInProgress && !leavingInProgress)) {
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
            ':gsi2pk': newQueueKeys.GSI2PK,
            ':gsi2sk': newQueueKeys.GSI2SK,
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

    const lockKey = buildDoctorDayLockKey(doctorId, visitDate);

    if (enteringInProgress) {
      try {
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
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
                    ':status': 'IN_PROGRESS',
                    ':expectedStatus': 'QUEUED',
                    ':updatedAt': now,
                    ':gsi2pk': newQueueKeys.GSI2PK,
                    ':gsi2sk': newQueueKeys.GSI2SK,
                  },
                  ConditionExpression: 'attribute_exists(PK) AND #status = :expectedStatus',
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: {
                    ...lockKey,
                    entityType: 'DOCTOR_DAY_LOCK',
                    doctorId,
                    visitDate,
                    visitId,
                    createdAt: now,
                  },
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ],
          }),
        );
      } catch (err) {
        if (
          err instanceof TransactionCanceledException ||
          err instanceof ConditionalCheckFailedException
        ) {
          throw new DoctorBusyError();
        }
        throw err;
      }
    } else if (leavingInProgress) {
      try {
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
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
                    ':expectedStatus': 'IN_PROGRESS',
                    ':updatedAt': now,
                    ':gsi2pk': newQueueKeys.GSI2PK,
                    ':gsi2sk': newQueueKeys.GSI2SK,
                  },
                  ConditionExpression: 'attribute_exists(PK) AND #status = :expectedStatus',
                },
              },
              {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: lockKey,
                  ConditionExpression: '#visitId = :visitId',
                  ExpressionAttributeNames: {
                    '#visitId': 'visitId',
                  },
                  ExpressionAttributeValues: {
                    ':visitId': visitId,
                  },
                },
              },
            ],
          }),
        );
      } catch (err) {
        if (
          err instanceof TransactionCanceledException ||
          err instanceof ConditionalCheckFailedException
        ) {
          throw new InvalidStatusTransitionError(
            `Invalid status transition ${current.status} -> ${nextStatus}`,
          );
        }
        throw err;
      }
    }

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

    const updated = await this.getById(visitId);
    return updated;
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

  async setCurrentRxPointer(params: {
    visitId: string;
    patientId: string;
    rxId: string;
    version: number;
  }): Promise<void> {
    const now = Date.now();

    const metaKey = buildVisitMetaKeys(params.visitId);
    const patientVisitKey = buildPatientVisitKeys(params.patientId, params.visitId);

    // Monotonic pointer update: only move forward (or set if missing).
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
    } catch (err) {
      // If the monotonic condition fails (newer pointer already set) this will cancel the transaction.
      // Treat that case as a no-op.
      if (
        err instanceof TransactionCanceledException ||
        err instanceof ConditionalCheckFailedException
      ) {
        return;
      }
      throw err;
    }
  }
}

export const visitRepository: VisitRepository = new DynamoDBVisitRepository();
