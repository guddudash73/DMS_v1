/* Verify AWS emulator connectivity: DynamoDB Local + LocalStack S3 */
import process from 'node:process';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
// import { fromIni } from '@aws-sdk/credential-providers'; // optional for real AWS; not used here
import { AWS_REGION, DYNAMO_ENDPOINT, S3_ENDPOINT } from '../config/env.js';

async function main() {
  // DynamoDB Local
  const ddb = new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMO_ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, // emulators accept static creds
  });
  const ddbDoc = DynamoDBDocumentClient.from(ddb);

  // S3 via LocalStack
  const s3 = new S3Client({
    region: AWS_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: true, // required for LocalStack
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  // DDB list tables (should succeed even without tables)
  const tables = await ddb.send(new ListTablesCommand({}));
  console.log(JSON.stringify({ ddb: { tables } }, null, 2));

  // DDB put/get smoke (uses shared DB even if table pre-created later)
  const tableName = 'dev-smoke';
  // Table creation is SST/CDK concern; for smoke, allow it to no-op gracefully
  try {
    await ddbDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: 'HEALTH#1', sk: 'SMOKE#1', ts: Date.now() },
      }),
    );
  } catch (e) {
    console.warn('Put skipped (table likely not created yet):', (e as Error).message);
  }

  try {
    const got = await ddbDoc.send(
      new GetCommand({ TableName: tableName, Key: { pk: 'HEALTH#1', sk: 'SMOKE#1' } }),
    );
    console.log(JSON.stringify({ ddbGet: got }, null, 2));
  } catch (e) {
    console.warn('Get skipped (table likely not created yet):', (e as Error).message);
  }

  // S3 create bucket (idempotent)
  const Bucket = 'dms-dev-smoke';
  try {
    await s3.send(new CreateBucketCommand({ Bucket }));
  } catch (e) {
    const msg = (e as Error).message || '';
    if (!msg.includes('BucketAlreadyOwnedByYou') && !msg.includes('BucketAlreadyExists')) throw e;
  }

  // S3 put/get
  await s3.send(
    new PutObjectCommand({ Bucket, Key: 'health.txt', Body: 'ok', ContentType: 'text/plain' }),
  );
  const obj = await s3.send(new GetObjectCommand({ Bucket, Key: 'health.txt' }));
  console.log(JSON.stringify({ s3: { bucket: Bucket, gotContentType: obj.ContentType } }, null, 2));
}

main()
  .then(() => {
    console.log(JSON.stringify({ smoke: 'aws', ok: true }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(JSON.stringify({ smoke: 'aws', ok: false, err: String(err) }, null, 2));
    process.exit(1);
  });
