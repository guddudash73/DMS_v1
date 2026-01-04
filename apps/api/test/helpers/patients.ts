// apps/api/test/helpers/patients.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getEnv } from '../../src/config/env';

const env = getEnv();

const ddbClient = new DynamoDBClient({
  region: env.APP_REGION,
  endpoint: env.DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const deletePatientCompletely = async (patientId: string): Promise<void> => {
  if (!env.DDB_TABLE_NAME) return;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: env.DDB_TABLE_NAME,
        Key: {
          PK: `PATIENT#${patientId}`,
          SK: 'PROFILE',
        },
      }),
    );
  } catch {
    // cleanup in tests - ignore not-found errors
  }

  try {
    const scan = await docClient.send(
      new ScanCommand({
        TableName: env.DDB_TABLE_NAME,
        FilterExpression: '#et = :idx AND #pid = :pid',
        ExpressionAttributeNames: {
          '#et': 'entityType',
          '#pid': 'patientId',
        },
        ExpressionAttributeValues: {
          ':idx': 'PATIENT_PHONE_INDEX',
          ':pid': patientId,
        },
      }),
    );

    for (const item of scan.Items ?? []) {
      const PK = (item as any).PK;
      const SK = (item as any).SK;
      if (!PK || !SK) continue;

      await docClient.send(
        new DeleteCommand({
          TableName: env.DDB_TABLE_NAME,
          Key: { PK, SK },
        }),
      );
    }
  } catch {
    // best-effort cleanup
  }
};
