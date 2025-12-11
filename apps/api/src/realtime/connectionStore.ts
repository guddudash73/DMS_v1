import { DynamoDBClient, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION ?? 'us-east-1';
const CONNECTIONS_TABLE = process.env.DDB_CONNECTIONS_TABLE;

if (!CONNECTIONS_TABLE) {
  console.warn(
    '[realtime] DDB_CONNECTIONS_TABLE not set; WebSocket connections will not be persisted.',
  );
}

const dynamoClient = new DynamoDBClient({
  region: REGION,
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface ConnectionRecord {
  connectionId: string;
  userId?: string;
  createdAt: number;
}

export async function addConnection(record: ConnectionRecord): Promise<void> {
  if (!CONNECTIONS_TABLE) return;

  try {
    await docClient.send(
      new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
          PK: `CONN#${record.connectionId}`,
          SK: 'META',
          entityType: 'WS_CONNECTION',
          ...record,
        },
      }),
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.warn('[realtime] connections table does not exist; skipping addConnection', {
        table: CONNECTIONS_TABLE,
      });
      return;
    }
    throw err;
  }
}

export async function removeConnection(connectionId: string): Promise<void> {
  if (!CONNECTIONS_TABLE) return;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: {
          PK: `CONN#${connectionId}`,
          SK: 'META',
        },
      }),
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.warn('[realtime] connections table does not exist; skipping removeConnection', {
        table: CONNECTIONS_TABLE,
      });
      return;
    }
    throw err;
  }
}

export async function listConnections(): Promise<ConnectionRecord[]> {
  if (!CONNECTIONS_TABLE) return [];

  try {
    const { Items } = await docClient.send(
      new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        FilterExpression: 'entityType = :t',
        ExpressionAttributeValues: {
          ':t': 'WS_CONNECTION',
        },
      }),
    );

    if (!Items || Items.length === 0) return [];

    return Items.map((item) => ({
      connectionId: item.connectionId as string,
      userId: item.userId as string | undefined,
      createdAt: Number(item.createdAt),
    }));
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.warn('[realtime] connections table does not exist; treating as 0 listeners', {
        table: CONNECTIONS_TABLE,
      });
      return [];
    }
    throw err;
  }
}
