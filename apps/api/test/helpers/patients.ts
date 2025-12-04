import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../../src/config/env';

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const deletePatientCompletely = async (patientId: string): Promise<void> => {
  if (!DDB_TABLE_NAME) return;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: DDB_TABLE_NAME,
        Key: {
          PK: `PATIENT#${patientId}`,
          SK: 'PROFILE',
        },
      }),
    );
  } catch {
    // cleanup in tests - to ignore not-found errors
  }
  try {
    const scan = await docClient.send(
      new ScanCommand({
        TableName: DDB_TABLE_NAME,
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
          TableName: DDB_TABLE_NAME,
          Key: { PK, SK },
        }),
      );
    }
  } catch {
    // best-effort cleanup
  }
};
