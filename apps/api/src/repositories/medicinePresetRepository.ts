import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../config/env';
import type { MedicinePreset, MedicineTypeaheadItem, QuickAddMedicineInput } from '@dms/types';

const ddbClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMO_ENDPOINT,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = DDB_TABLE_NAME;
if (!TABLE_NAME) {
  throw new Error('DDB_TABLE_NAME env var is required');
}

const buildMedicinePresetKey = (id: string) => ({
  PK: `MEDICINE_PRESET#${id}`,
  SK: 'META',
});

const buildMedicineNameIndexKey = (normalizedName: string) => ({
  PK: `MEDICINE_NAME#${normalizedName}`,
  SK: 'META',
});

const buildMedicinePresetGsi1 = (normalizedName: string) => ({
  GSI1PK: 'MEDICINE_PRESET',
  GSI1SK: `NAME#${normalizedName}`,
});

const normalizeMedicineName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');

export interface MedicinePresetRepository {
  search(params: { query?: string; limit: number }): Promise<MedicineTypeaheadItem[]>;
  quickAdd(params: {
    input: QuickAddMedicineInput;
    createdByUserId: string;
    source: 'ADMIN_IMPORT' | 'INLINE_DOCTOR';
  }): Promise<MedicinePreset>;
}

export class DynamoDBMedicinePresetRepository implements MedicinePresetRepository {
  async search(params: { query?: string; limit: number }): Promise<MedicineTypeaheadItem[]> {
    const { query, limit } = params;

    const normalizedQuery = query && query.trim().length > 0 ? normalizeMedicineName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = {
      ':pk': 'MEDICINE_PRESET',
    };

    if (normalizedQuery) {
      keyCondition += ' AND begins_with(GSI1SK, :skPrefix)';
      exprValues[':skPrefix'] = `NAME#${normalizedQuery}`;
    }

    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        ScanIndexForward: true,
        Limit: limit,
      }),
    );

    const presets = (Items ?? []) as MedicinePreset[];

    const result: MedicineTypeaheadItem[] = presets.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      defaultFrequency: p.defaultFrequency,
      defaultDuration: p.defaultDuration,
      form: p.form,
    }));

    return result;
  }

  async quickAdd(params: {
    input: QuickAddMedicineInput;
    createdByUserId: string;
    source: 'ADMIN_IMPORT' | 'INLINE_DOCTOR';
  }): Promise<MedicinePreset> {
    const { input, createdByUserId, source } = params;
    const normalizedName = normalizeMedicineName(input.displayName);

    const existingNameIndex = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildMedicineNameIndexKey(normalizedName),
      }),
    );

    if (existingNameIndex.Item && existingNameIndex.Item.medicinePresetId) {
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: buildMedicinePresetKey(existingNameIndex.Item.medicinePresetId as string),
          ConsistentRead: true,
        }),
      );

      if (Item && Item.entityType === 'MEDICINE_PRESET') {
        return Item as MedicinePreset;
      }
    }

    const now = Date.now();
    const id = randomUUID();

    const preset: MedicinePreset = {
      id,
      displayName: input.displayName,
      normalizedName,
      defaultDose: input.defaultDose,
      defaultFrequency: input.defaultFrequency,
      defaultDuration: input.defaultDuration,
      form: input.form,
      tags: undefined,
      createdAt: now,
      createdByUserId,
      source,
      verified: source === 'ADMIN_IMPORT',
    };

    const presetItem = {
      ...buildMedicinePresetKey(id),
      entityType: 'MEDICINE_PRESET',
      ...buildMedicinePresetGsi1(normalizedName),
      ...preset,
    };

    const nameIndexItem = {
      ...buildMedicineNameIndexKey(normalizedName),
      entityType: 'MEDICINE_NAME_INDEX',
      medicinePresetId: id,
      createdAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: nameIndexItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: presetItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );

    return preset;
  }
}

export const medicinePresetRepository: MedicinePresetRepository =
  new DynamoDBMedicinePresetRepository();
