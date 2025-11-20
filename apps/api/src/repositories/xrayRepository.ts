import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DYNAMO_ENDPOINT, DDB_TABLE_NAME } from '../config/env';
import type { Visit } from '@dms/types';
import type { Xray, XrayContentType } from '@dms/types';
import { key } from '@dms/types';

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

export interface XrayMetaDataInput {
  visit: Visit;
  xrayId: string;
  contentType: XrayContentType;
  size: number;
  takenAt: number;
  takenByUserId: string;
  contentKey: string;
  thumbKey?: string;
}

export interface XrayRepository {
  putMetadata(input: XrayMetaDataInput): Promise<Xray>;
  getById(xrayId: string): Promise<Xray | null>;
}

export class DynamoDBXrayRepository implements XrayRepository {
  async putMetadata(input: XrayMetaDataInput): Promise<Xray> {
    const now = Date.now();
    const xrayId = input.xrayId ?? randomUUID;

    const base: Xray = {
      xrayId,
      visitId: input.visit.visitId,
      contentKey: input.contentKey,
      thumbKey: input.thumbKey,
      contentType: input.contentType,
      size: input.size,
      takenAt: input.takenAt,
      takenByUserId: input.takenByUserId,
      createdAt: now,
      deletedAt: undefined,
    };

    const visitScopedItem = {
      PK: key.visitPK(input.visit.visitId),
      SK: key.xraySK(xrayId),
      entityType: 'XRAY',
      patientId: input.visit.patientId,
      doctorId: input.visit.doctorId,
      visitDate: input.visit.visitDate,
      ...base,
      GSI3PK: key.gsi3PK_date(input.visit.visitDate),
      GSI3SK: key.gsi3SK_typeId('XRAY', xrayId),
    };

    const xrayMetaItem = {
      PK: `XRAY#${xrayId}`,
      SK: `META`,
      entityType: 'XRAY',
      ...base,
      patientId: input.visit.patientId,
      doctorId: input.visit.doctorId,
      visitDate: input.visit.visitDate,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: visitScopedItem,
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: xrayMetaItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );
    return base;
  }

  async getById(xrayId: string): Promise<Xray | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `XRAY#${xrayId}`,
          SK: 'META',
        },
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'XRAY') return null;
    if (Item.deletedAt != null) {
      return null;
    }

    return Item as Xray;
  }
}

export const xrayRepository: XrayRepository = new DynamoDBXrayRepository();
