import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../config/env';

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = DDB_TABLE_NAME;
if (!TABLE_NAME) throw new Error('DDB_TABLE_NAME env var is required');

const buildRefreshTokenKey = (userId: string, jti: string) => ({
  PK: `REFRESH_TOKEN#${userId}`,
  SK: `RT#${jti}`,
});

export interface RefreshTokenRecord {
  userId: string;
  jti: string;
  expiresAt: number;
  valid: boolean;
  createdAt: number;
  revokedAt?: number;
}

export interface RefreshTokenRepository {
  create(params: { userId: string; jti: string; expiresAt: number }): Promise<void>;
  consume(params: { userId: string; jti: string }): Promise<RefreshTokenRecord | null>;
}

export class DynamoDBRefreshTokenRepository implements RefreshTokenRepository {
  async create(params: { userId: string; jti: string; expiresAt: number }): Promise<void> {
    const now = Date.now();
    const record: RefreshTokenRecord = {
      userId: params.userId,
      jti: params.jti,
      expiresAt: params.expiresAt,
      valid: true,
      createdAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...buildRefreshTokenKey(params.userId, params.jti),
          entityType: 'REFRESH_TOKEN',
          ...record,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  }

  async consume(params: { userId: string; jti: string }): Promise<RefreshTokenRecord | null> {
    const key = buildRefreshTokenKey(params.userId, params.jti);

    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: key,
        ConsistentRead: true,
      }),
    );
    if (!Item || Item.entityType !== 'REFRESH_TOKEN') return null;

    const now = Date.now();
    if (!Item.valid || typeof Item.expiresAt !== 'number' || Item.expiresAt < now) {
      return null;
    }

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key,
        UpdateExpression: 'SET #valid = :false, #revokedAt = :revokedAt',
        ExpressionAttributeNames: {
          '#valid': 'valid',
          '#revokedAt': 'revokedAt',
        },
        ExpressionAttributeValues: {
          ':false': false,
          ':revokedAt': now,
          ':true': true,
        },
        ConditionExpression: 'attribute_exists(PK) AND #valid = :true',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes) return null;
    return Attributes as RefreshTokenRecord;
  }
}

export const refreshTokenRepository: RefreshTokenRepository = new DynamoDBRefreshTokenRepository();
