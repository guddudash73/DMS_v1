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

type Key = { PK: string; SK: string };

async function deleteKeys(keys: Key[]) {
  for (const { PK, SK } of keys) {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: env.DDB_TABLE_NAME,
          Key: { PK, SK },
        }),
      );
    } catch {
      // best-effort cleanup
    }
  }
}

export const deletePatientCompletely = async (patientId: string): Promise<void> => {
  if (!env.DDB_TABLE_NAME) return;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: env.DDB_TABLE_NAME,
        Key: { PK: `PATIENT#${patientId}`, SK: 'PROFILE' },
      }),
    );
  } catch {
    // ignore
  }

  const patientScopedKeys: Key[] = [];
  try {
    const scan = await docClient.send(
      new ScanCommand({
        TableName: env.DDB_TABLE_NAME,
        FilterExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PATIENT#${patientId}`,
        },
      }),
    );

    for (const item of scan.Items ?? []) {
      const PK = (item as any).PK as string | undefined;
      const SK = (item as any).SK as string | undefined;
      if (PK && SK) patientScopedKeys.push({ PK, SK });
    }
  } catch {
    // ignore
  }

  await deleteKeys(patientScopedKeys);

  const visitIds = new Set<string>();
  try {
    const scanVisits = await docClient.send(
      new ScanCommand({
        TableName: env.DDB_TABLE_NAME,
        FilterExpression: '#pid = :pid AND begins_with(#pk, :vpk)',
        ExpressionAttributeNames: {
          '#pid': 'patientId',
          '#pk': 'PK',
        },
        ExpressionAttributeValues: {
          ':pid': patientId,
          ':vpk': 'VISIT#',
        },
      }),
    );

    for (const item of scanVisits.Items ?? []) {
      const pk = (item as any).PK as string | undefined;
      if (!pk) continue;
      const parts = pk.split('#');
      if (parts.length >= 2) visitIds.add(parts.slice(1).join('#'));
    }
  } catch {
    // ignore
  }

  for (const visitId of visitIds) {
    const keys: Key[] = [];
    try {
      const scanVisitPartition = await docClient.send(
        new ScanCommand({
          TableName: env.DDB_TABLE_NAME,
          FilterExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `VISIT#${visitId}`,
          },
        }),
      );

      for (const item of scanVisitPartition.Items ?? []) {
        const PK = (item as any).PK as string | undefined;
        const SK = (item as any).SK as string | undefined;
        if (PK && SK) keys.push({ PK, SK });
      }
    } catch {
      // ignore
    }

    await deleteKeys(keys);

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: env.DDB_TABLE_NAME,
          Key: { PK: `PATIENT#${patientId}`, SK: `VISIT#${visitId}` },
        }),
      );
    } catch {
      // ignore
    }
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

    const keys: Key[] = [];
    for (const item of scan.Items ?? []) {
      const PK = (item as any).PK as string | undefined;
      const SK = (item as any).SK as string | undefined;
      if (PK && SK) keys.push({ PK, SK });
    }

    await deleteKeys(keys);
  } catch {
    // ignore
  }
};
