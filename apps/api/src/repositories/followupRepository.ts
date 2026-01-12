import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { FollowUpContactMethod } from '@dcm/types';
import type {
  FollowUp,
  FollowUpCreate,
  FollowUpStatus,
  FollowUpStatusUpdate,
  Visit,
  VisitId,
  FollowUpId,
  FollowUpContactMethod as FollowUpContactMethodType,
} from '@dcm/types';
import { v4 as randomUUID } from 'uuid';
import { visitRepository } from './visitRepository';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import { isoDateInTimeZone } from '../lib/date';

export class FollowUpRuleViolationError extends Error {
  readonly code = 'FOLLOWUP_RULE_VIOLATION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'FollowUpRuleViolationError';
  }
}

const parseContactMethod = (value: unknown): FollowUpContactMethodType => {
  const parsed = FollowUpContactMethod.safeParse(value);
  return parsed.success ? parsed.data : 'OTHER';
};

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const buildFollowUpKey = (visitId: string, followupId: string) => ({
  PK: `VISIT#${visitId}`,
  SK: `FOLLOWUP#${followupId}`,
});

const buildGsi3 = (followUpDate: string, followupId: string) => ({
  GSI3PK: `DATE#${followUpDate}`,
  GSI3SK: `TYPE#FOLLOWUP#ID#${followupId}`,
});

const todayDateString = (): string => isoDateInTimeZone(new Date(), 'Asia/Kolkata');

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
  listByVisitId(visitId: VisitId): Promise<FollowUp[]>;
  createForVisit(visitId: VisitId, input: FollowUpCreate): Promise<FollowUp>;
  listActiveByFollowUpDate(dateISO: string): Promise<FollowUp[]>;
  listByFollowUpDate(dateISO: string): Promise<FollowUp[]>;
  updateStatus(args: {
    visitId: VisitId;
    followupId: FollowUpId;
    input: FollowUpStatusUpdate;
  }): Promise<FollowUp | null>;
}

export class DynamoDBFollowupRepository implements FollowupRepository {
  async listByVisitId(visitId: VisitId): Promise<FollowUp[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `VISIT#${visitId}`,
          ':sk': 'FOLLOWUP#',
        },
        ConsistentRead: true,
      }),
    );

    return (res.Items ?? [])
      .filter((x) => x.entityType === 'FOLLOWUP')
      .map((x) => ({
        followupId: String(x.followupId),
        visitId: String(x.visitId),
        followUpDate: String(x.followUpDate),
        reason: x.reason as string | undefined,
        contactMethod: parseContactMethod(x.contactMethod),
        status: String(x.status) as FollowUpStatus,
        createdAt: Number(x.createdAt),
        updatedAt: Number(x.updatedAt),
      }));
  }

  async createForVisit(visitId: VisitId, input: FollowUpCreate): Promise<FollowUp> {
    const visit = await visitRepository.getById(visitId);
    if (!visit) throw new FollowUpRuleViolationError('Visit not found for follow-up creation');

    assertValidFollowUpDate(visit, input.followUpDate);

    const now = Date.now();
    const followupId = randomUUID();

    const item: FollowUp = {
      followupId,
      visitId,
      followUpDate: input.followUpDate,
      reason: input.reason,
      contactMethod: input.contactMethod ?? 'CALL',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...buildFollowUpKey(visitId, followupId),
          ...buildGsi3(item.followUpDate, followupId),
          entityType: 'FOLLOWUP',
          ...item,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    return item;
  }

  async listActiveByFollowUpDate(dateISO: string): Promise<FollowUp[]> {
    const res = await this.listByFollowUpDate(dateISO);
    return res.filter((x) => x.status === 'ACTIVE');
  }

  async listByFollowUpDate(dateISO: string): Promise<FollowUp[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk AND begins_with(GSI3SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `DATE#${dateISO}`,
          ':sk': 'TYPE#FOLLOWUP#ID#',
        },
      }),
    );

    return (res.Items ?? [])
      .filter((x) => x.entityType === 'FOLLOWUP')
      .map((x) => ({
        followupId: String(x.followupId),
        visitId: String(x.visitId),
        followUpDate: String(x.followUpDate),
        reason: x.reason as string | undefined,
        contactMethod: parseContactMethod(x.contactMethod),
        status: String(x.status) as FollowUpStatus,
        createdAt: Number(x.createdAt),
        updatedAt: Number(x.updatedAt),
      }));
  }

  async updateStatus(args: {
    visitId: VisitId;
    followupId: FollowUpId;
    input: FollowUpStatusUpdate;
  }): Promise<FollowUp | null> {
    const { visitId, followupId, input } = args;
    const now = Date.now();

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildFollowUpKey(visitId, followupId),
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': input.status,
          ':updatedAt': now,
        },
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes || Attributes.entityType !== 'FOLLOWUP') return null;

    return {
      followupId: String(Attributes.followupId),
      visitId: String(Attributes.visitId),
      followUpDate: String(Attributes.followUpDate),
      reason: Attributes.reason,
      contactMethod: Attributes.contactMethod,
      status: Attributes.status as FollowUpStatus,
      createdAt: Attributes.createdAt,
      updatedAt: Attributes.updatedAt,
    };
  }
}

export const followupRepository: FollowupRepository = new DynamoDBFollowupRepository();
