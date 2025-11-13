import { beforeAll } from 'vitest';
import { DynamoDBClient, ListTablesCommand, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../src/config/env';

const client = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

async function ensureTableExists() {
  const tables = await client.send(new ListTablesCommand({}));

  if (tables.TableNames?.includes(DDB_TABLE_NAME)) {
    return;
  }
  console.log(`DynamoDB table "${DDB_TABLE_NAME}" not found - creating in Local instance`);

  await client.send(
    new CreateTableCommand({
      TableName: DDB_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );

  console.log(`DynamoDB table "${DDB_TABLE_NAME}" created for tests.`);
}

beforeAll(async () => {
  await ensureTableExists();
});
