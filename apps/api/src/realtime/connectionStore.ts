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
  console.warn('[realtime] DDB_CONNECTIONS_TABLE not set');
}

const awsDynamoClient = new DynamoDBClient({
  region: REGION,
});

const docClient = DynamoDBDocumentClient.from(awsDynamoClient, {
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
      console.warn('[realtime] connections table not found (AWS)');
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
    if (err instanceof ResourceNotFoundException) return;
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

    return (
      Items?.map((item) => ({
        connectionId: item.connectionId as string,
        userId: item.userId as string | undefined,
        createdAt: Number(item.createdAt),
      })) ?? []
    );
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return [];
    throw err;
  }
}
