import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../config/env';
import type {
  FollowUp,
  FollowUpStatus,
  FollowUpUpsert,
  FollowUpStatusUpdate,
  Visit,
  VisitId,
} from '@dms/types';
import { visitRepository } from './visitRepository';

export class FollowUpRuleViolationError extends Error {
  readonly code = 'FOLLOWUP_RULE_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'FollowUpRuleViolationError';
  }
}

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = DDB_TABLE_NAME;
if (!TABLE_NAME) {
  throw new Error('DDB_TABLE_NAME env var is required');
}

const buildFollowUpKey = (visitId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: 'FOLLOWUP',
});

const todayDateString = (): string => new Date().toISOString().slice(0, 10);

const assertValidFollowUpDate = (visit: Visit, followUpDate: string) => {
  const visitDate = visit.visitDate;
  const today = todayDateString();

  if (followUpDate < visitDate) {
    throw new FollowUpRuleViolationError(
      `followUpDate ${followUpDate} cannot be before visitDate ${visitDate}`,
    );
  }

  if (followUpDate < today) {
    throw new FollowUpRuleViolationError(
      `followUpDate ${followUpDate} cannot be in the past relative to today ${today}`,
    );
  }
};

export interface FollowupRepository {
  getByVisitId(visitId: VisitId): Promise<FollowUp | null>;
  upsertForVisit(visitId: VisitId, input: FollowUpUpsert): Promise<FollowUp>;
  updateStatus(visitId: VisitId, input: FollowUpStatusUpdate): Promise<FollowUp | null>;
}

export class DynamoDBFollowupRepository implements FollowupRepository {
  async getByVisitId(visitId: VisitId): Promise<FollowUp | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildFollowUpKey(visitId),
      }),
    );

    if (!Item || Item.entityType !== 'FOLLOWUP') return null;
    return Item as FollowUp;
  }

  async upsertForVisit(visitId: VisitId, input: FollowUpUpsert): Promise<FollowUp> {
    const visit = await visitRepository.getById(visitId);
    if (!visit) {
      throw new FollowUpRuleViolationError('Visit not found for follow-up creation');
    }

    assertValidFollowUpDate(visit, input.followUpDate);

    const existing = await this.getByVisitId(visitId);
    const now = Date.now();

    const contactMethod = input.contactMethod ?? existing?.contactMethod ?? 'CALL';

    const item: FollowUp = {
      visitId,
      followUpDate: input.followUpDate,
      reason: input.reason ?? existing?.reason,
      contactMethod,
      status: 'ACTIVE',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...buildFollowUpKey(visitId),
          entityType: 'FOLLOWUP',
          ...item,
        },
      }),
    );

    return item;
  }

  async updateStatus(visitId: VisitId, input: FollowUpStatusUpdate): Promise<FollowUp | null> {
    const existing = await this.getByVisitId(visitId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const { status } = input;

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildFollowUpKey(visitId),
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes) return null;

    return {
      visitId,
      followUpDate: Attributes.followUpDate,
      reason: Attributes.reason,
      contactMethod: Attributes.contactMethod,
      status: Attributes.status as FollowUpStatus,
      createdAt: Attributes.createdAt,
      updatedAt: Attributes.updatedAt,
    };
  }
}

export const followupRepository: FollowupRepository = new DynamoDBFollowupRepository();
