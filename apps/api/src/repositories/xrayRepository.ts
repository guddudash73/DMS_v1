import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Visit, Xray, XrayContentType } from '@dms/types';
import { key } from '@dms/types';
import { dynamoClient, TABLE_NAME } from '../config/aws';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

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

export class XrayConflictError extends Error {
  readonly code = 'XRAY_CONFLICT' as const;

  constructor(message = 'X-ray metadata already exists for this ID') {
    super(message);
    this.name = 'XrayConflictError';
  }
}

export class DynamoDBXrayRepository implements XrayRepository {
  async putMetadata(input: XrayMetaDataInput): Promise<Xray> {
    const now = Date.now();
    const xrayId = input.xrayId;

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

    try {
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
    } catch (err) {
      if (
        err instanceof ConditionalCheckFailedException ||
        err instanceof TransactionCanceledException
      ) {
        throw new XrayConflictError();
      }
      throw err;
    }

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

    if (Item.patientIsDeleted === true || Item.visitIsDeleted === true) {
      return null;
    }

    return Item as Xray;
  }
}

export const xrayRepository: XrayRepository = new DynamoDBXrayRepository();
