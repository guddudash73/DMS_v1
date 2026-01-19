import { DynamoDBClient, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = process.env.APP_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
const CONNECTIONS_TABLE = process.env.DDB_CONNECTIONS_TABLE;

if (!CONNECTIONS_TABLE) {
  console.warn('[realtime] DDB_CONNECTIONS_TABLE not set');
}

const CONN_GSI_NAME = 'EntityTypeIndex';
const CONN_ENTITY = 'WS_CONNECTION';

const awsDynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(awsDynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface ConnectionRecord {
  connectionId: string;
  userId?: string;
  createdAt: number;
}

const TTL_SECONDS = 3 * 60 * 60;
function ttlEpochSeconds() {
  return Math.floor(Date.now() / 1000) + TTL_SECONDS;
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
          entityType: CONN_ENTITY,

          GSI1PK: CONN_ENTITY,
          GSI1SK: record.connectionId,

          ttl: ttlEpochSeconds(),

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

export async function touchConnectionTtl(connectionId: string): Promise<void> {
  if (!CONNECTIONS_TABLE) return;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: CONNECTIONS_TABLE,
        Key: {
          PK: `CONN#${connectionId}`,
          SK: 'META',
        },
        UpdateExpression: 'SET ttl = :ttl',
        ExpressionAttributeValues: {
          ':ttl': ttlEpochSeconds(),
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
      new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: CONN_GSI_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': CONN_ENTITY,
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
