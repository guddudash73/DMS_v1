import {
  DynamoDBClient,
  ListTablesCommand,
  CreateTableCommand,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../config/env';

const client = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

export async function ensureDynamoTable() {
  if (!DDB_TABLE_NAME) {
    throw new Error('DDB_TABLE_NAME env var is required');
  }

  const tables = await client.send(new ListTablesCommand({}));

  if (tables.TableNames?.includes(DDB_TABLE_NAME)) {
    return;
  }

  console.log(`DynamoDB table "${DDB_TABLE_NAME}" not found - creating in Local instance`);

  try {
    await client.send(
      new CreateTableCommand({
        TableName: DDB_TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
          { AttributeName: 'GSI3PK', AttributeType: 'S' },
          { AttributeName: 'GSI3SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
          {
            IndexName: 'GSI2',
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH' },
              { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
          {
            IndexName: 'GSI3',
            KeySchema: [
              { AttributeName: 'GSI3PK', KeyType: 'HASH' },
              { AttributeName: 'GSI3SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );

    console.log(`DynamoDB table "${DDB_TABLE_NAME}" created.`);
  } catch (err) {
    if (err instanceof ResourceInUseException || (err as any)?.name === 'ResourceInUseException') {
      console.log(
        `DynamoDB table "${DDB_TABLE_NAME}" is already being created or exists (ResourceInUseException).`,
      );
      return;
    }
    throw err;
  }
}
