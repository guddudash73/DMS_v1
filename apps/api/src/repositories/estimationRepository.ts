import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  Estimation,
  EstimationCreateRequest,
  EstimationId,
  PatientEstimationsListResponse,
  PatientId,
  UserId,
} from '@dcm/types';
import { v4 as randomUUID } from 'uuid';

import { dynamoClient, TABLE_NAME } from '../config/aws';
import { patientRepository } from './patientRepository';

export class EstimationRuleViolationError extends Error {
  readonly code = 'ESTIMATION_RULE_VIOLATION' as const;
  readonly statusCode = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = 'EstimationRuleViolationError';
  }
}

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

/* ------------------ Keys ------------------ */

const buildPatientEstimationKey = (patientId: string, estimationId: string) => ({
  PK: `PATIENT#${patientId}`,
  SK: `ESTIMATION#${estimationId}`,
});

const buildEstimationCounterKey = (year: number) => ({
  PK: `COUNTER#ESTIMATION#${year}`,
  SK: 'META',
});

/* ------------------ Helpers ------------------ */

function computeTotal(input: EstimationCreateRequest): number {
  let total = 0;

  for (const line of input.items) {
    if (!Number.isFinite(line.quantity) || line.quantity < 1) {
      throw new EstimationRuleViolationError('Quantity must be at least 1');
    }

    if (!Number.isFinite(line.amount) || line.amount < 0) {
      throw new EstimationRuleViolationError('Invalid line amount');
    }

    total += line.amount;
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new EstimationRuleViolationError('Invalid total');
  }

  return total;
}

async function nextEstimationSequence(year: number): Promise<number> {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: buildEstimationCounterKey(year),
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

  return Number(Attributes?.last ?? 0);
}

function formatEstimationNo(year: number, seq: number): string {
  return `EST/${year}/SD/${String(seq).padStart(6, '0')}`;
}

/* ------------------ Repository ------------------ */

export interface EstimationRepository {
  create(args: {
    patientId: PatientId;
    createdByUserId: UserId;
    input: EstimationCreateRequest;
  }): Promise<Estimation>;

  listByPatient(args: {
    patientId: PatientId;
    limit?: number;
    cursor?: string;
  }): Promise<PatientEstimationsListResponse>;

  getByPatient(args: {
    patientId: PatientId;
    estimationId: EstimationId;
  }): Promise<Estimation | null>;

  updateByPatient(args: {
    patientId: PatientId;
    estimationId: EstimationId;
    input: EstimationCreateRequest;
  }): Promise<Estimation | null>;

  deleteByPatient(args: { patientId: PatientId; estimationId: EstimationId }): Promise<boolean>;
}

export class DynamoDBEstimationRepository implements EstimationRepository {
  async create(args: {
    patientId: PatientId;
    createdByUserId: UserId;
    input: EstimationCreateRequest;
  }): Promise<Estimation> {
    const { patientId, createdByUserId, input } = args;

    const patient = await patientRepository.getById(patientId);
    if (!patient || (patient as any).isDeleted) {
      throw new EstimationRuleViolationError('Patient not found');
    }

    const now = Date.now();
    const year = new Date(now).getFullYear();

    const seq = await nextEstimationSequence(year);
    const estimationNo = formatEstimationNo(year, seq);

    const estimationId = randomUUID();
    const total = computeTotal(input);

    const estimation: Estimation = {
      estimationId,
      estimationNo,
      patientId,

      items: input.items,
      total,
      currency: 'INR',

      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.validUntil ? { validUntil: input.validUntil } : {}),

      createdByUserId,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...buildPatientEstimationKey(patientId, estimationId),
          entityType: 'ESTIMATION',
          ...estimation,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    return estimation;
  }

  async listByPatient(args: {
    patientId: PatientId;
    limit?: number;
    cursor?: string;
  }): Promise<PatientEstimationsListResponse> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PATIENT#${args.patientId}`,
          ':sk': 'ESTIMATION#',
        },
        Limit: args.limit ?? 25,
        ConsistentRead: true,
      }),
    );

    const items = (res.Items ?? [])
      .filter((x) => (x as any).entityType === 'ESTIMATION')
      .map((x) => x as Estimation)
      .sort((a, b) => b.createdAt - a.createdAt);

    return { items, nextCursor: null };
  }

  async getByPatient(args: {
    patientId: PatientId;
    estimationId: EstimationId;
  }): Promise<Estimation | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildPatientEstimationKey(args.patientId, args.estimationId),
        ConsistentRead: true,
      }),
    );

    if (!Item || (Item as any).entityType !== 'ESTIMATION') return null;
    return Item as Estimation;
  }

  async updateByPatient(args: {
    patientId: PatientId;
    estimationId: EstimationId;
    input: EstimationCreateRequest;
  }): Promise<Estimation | null> {
    const { patientId, estimationId, input } = args;

    const total = computeTotal(input);
    const now = Date.now();

    const names: Record<string, string> = {
      '#items': 'items',
      '#total': 'total',
      '#updatedAt': 'updatedAt',
      '#entityType': 'entityType',
    };

    const values: Record<string, any> = {
      ':items': input.items,
      ':total': total,
      ':now': now,
      ':etype': 'ESTIMATION',
    };

    let update = 'SET #items = :items, #total = :total, #updatedAt = :now';
    let remove = '';

    // notes
    if (input.notes && input.notes.trim().length > 0) {
      names['#notes'] = 'notes';
      values[':notes'] = input.notes.trim();
      update += ', #notes = :notes';
    } else {
      names['#notes'] = 'notes';
      remove += (remove ? ', ' : 'REMOVE ') + '#notes';
    }

    // validUntil
    if (input.validUntil && input.validUntil.trim().length > 0) {
      names['#validUntil'] = 'validUntil';
      values[':validUntil'] = input.validUntil.trim();
      update += ', #validUntil = :validUntil';
    } else {
      names['#validUntil'] = 'validUntil';
      remove += (remove ? ', ' : 'REMOVE ') + '#validUntil';
    }

    const res = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildPatientEstimationKey(patientId, estimationId),
        UpdateExpression: `${update} ${remove}`.trim(),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,

        // must exist + must be estimation
        ConditionExpression:
          'attribute_exists(PK) AND attribute_exists(SK) AND #entityType = :etype',
        ReturnValues: 'ALL_NEW',
      }),
    );

    const item = res.Attributes as any;
    if (!item) return null;
    if (item.entityType !== 'ESTIMATION') return null;

    return item as Estimation;
  }

  async deleteByPatient(args: {
    patientId: PatientId;
    estimationId: EstimationId;
  }): Promise<boolean> {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: buildPatientEstimationKey(args.patientId, args.estimationId),
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        }),
      );
      return true;
    } catch (e: any) {
      // Dynamo throws ConditionalCheckFailedException when not found
      if (e?.name === 'ConditionalCheckFailedException') return false;
      throw e;
    }
  }
}

export const estimationRepository: EstimationRepository = new DynamoDBEstimationRepository();
