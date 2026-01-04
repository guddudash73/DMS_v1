// apps/api/src/dev/smoke-aws.ts
import process from 'node:process';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getEnv } from '../config/env';
import { log } from '../lib/logger';

const env = getEnv();

async function main() {
  const ddb = new DynamoDBClient({
    region: env.APP_REGION,
    endpoint: env.DYNAMO_ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const ddbDoc = DynamoDBDocumentClient.from(ddb);

  const s3 = new S3Client({
    region: env.APP_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  const tables = await ddb.send(new ListTablesCommand({}));
  log('aws.smoke.ddb.listTables.ok', { tables });

  const tableName = 'dev-smoke';

  try {
    await ddbDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: 'HEALTH#1', sk: 'SMOKE#1', ts: Date.now() },
      }),
    );
    log('aws.smoke.ddb.put.ok', { tableName });
  } catch (e) {
    log('aws.smoke.ddb.put.skip', { tableName, reason: (e as Error).message });
  }

  try {
    const got = await ddbDoc.send(
      new GetCommand({ TableName: tableName, Key: { pk: 'HEALTH#1', sk: 'SMOKE#1' } }),
    );
    log('aws.smoke.ddb.get.ok', { tableName, item: got.Item ?? null });
  } catch (e) {
    log('aws.smoke.ddb.get.skip', { tableName, reason: (e as Error).message });
  }

  const Bucket = 'dms-dev-smoke';
  try {
    await s3.send(new CreateBucketCommand({ Bucket }));
    log('aws.smoke.s3.createBucket.ok', { Bucket });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (!msg.includes('BucketAlreadyOwnedByYou') && !msg.includes('BucketAlreadyExists')) {
      throw e;
    }
    log('aws.smoke.s3.createBucket.exists', { Bucket });
  }

  await s3.send(
    new PutObjectCommand({ Bucket, Key: 'health.txt', Body: 'ok', ContentType: 'text/plain' }),
  );
  const obj = await s3.send(new GetObjectCommand({ Bucket, Key: 'health.txt' }));
  log('aws.smoke.s3.getObject.ok', {
    Bucket,
    key: 'health.txt',
    contentType: obj.ContentType ?? null,
  });
}

main()
  .then(() => {
    log('aws.smoke.done', { ok: true });
    process.exit(0);
  })
  .catch((err) => {
    log('aws.smoke.fail', { ok: false, err: String(err) });
    process.exit(1);
  });
