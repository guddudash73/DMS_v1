// apps/api/src/config/aws.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { getEnv } from './env';

const env = getEnv();

if (!env.DDB_TABLE_NAME) {
  throw new Error('DDB_TABLE_NAME env var is required');
}

const httpHandler = new NodeHttpHandler({
  connectionTimeout: 1_000,
  socketTimeout: 3_000,
});

export const dynamoClient = new DynamoDBClient({
  region: env.APP_REGION,
  endpoint: env.DYNAMO_ENDPOINT,
  requestHandler: httpHandler,
  maxAttempts: 3,
});

export const dynamoLocalClient = dynamoClient;

export const s3Client = new S3Client({
  region: env.APP_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  requestHandler: httpHandler,
  maxAttempts: 3,
});

export const TABLE_NAME = env.DDB_TABLE_NAME;
