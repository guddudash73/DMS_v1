import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT, S3_ENDPOINT } from './env';

if (!DDB_TABLE_NAME) {
  throw new Error('DDB_TABLE_NAME env var is required');
}

const httpHandler = new NodeHttpHandler({
  connectionTimeout: 1_000,
  socketTimeout: 3_000,
});

export const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
  requestHandler: httpHandler,
  maxAttempts: 3,
});

export const s3Client = new S3Client({
  region: AWS_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  requestHandler: httpHandler,
  maxAttempts: 3,
});

export const TABLE_NAME = DDB_TABLE_NAME;
