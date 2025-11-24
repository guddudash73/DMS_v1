import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DDB_TABLE_NAME, DYNAMO_ENDPOINT } from '../config/env';
import type {
  PrescriptionPreset,
  PrescriptionPresetId,
  PrescriptionPresetSearchQuery,
  RxLineType,
} from '@dms/types';

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

const buildRxPresetKey = (id: string) => ({
  PK: `RX_PRESET#${id}`,
  SK: 'META',
});

const buildRxPresetGsi1 = (normalizedName: string) => ({
  GSI1PK: 'RX_PRESET',
  GSI1SK: `NAME#${normalizedName}`,
});

const normalizePresetName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');

export interface PrescriptionPresetRepository {
  search(params: PrescriptionPresetSearchQuery): Promise<PrescriptionPreset[]>;
  create(input: {
    name: string;
    lines: RxLineType[];
    tags?: string[];
    createdByUserId: string;
  }): Promise<PrescriptionPreset>;
  update(
    id: PrescriptionPresetId,
    patch: { name?: string; lines?: RxLineType[]; tags?: string[] },
  ): Promise<PrescriptionPreset | null>;
  getById(id: PrescriptionPresetId): Promise<PrescriptionPreset | null>;
}

export class DynamoDBPrescriptionPresetRepository implements PrescriptionPresetRepository {
  async search(params: PrescriptionPresetSearchQuery): Promise<PrescriptionPreset[]> {
    const { query, limit } = params;
    const normalizedQuery = query && query.trim().length > 0 ? normalizePresetName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = {
      ':pk': 'RX_PRESET',
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

    return (Items ?? []) as PrescriptionPreset[];
  }

  async create(input: {
    name: string;
    lines: RxLineType[];
    tags?: string[];
    createdByUserId: string;
  }): Promise<PrescriptionPreset> {
    const now = Date.now();
    const id = randomUUID();
    const normalizedName = normalizePresetName(input.name);

    const preset: PrescriptionPreset = {
      id,
      name: input.name,
      lines: input.lines,
      tags: input.tags,
      createdByUserId: input.createdByUserId,
      createdAt: now,
    };

    const item = {
      ...buildRxPresetKey(id),
      entityType: 'RX_PRESET',
      ...buildRxPresetGsi1(normalizedName),
      ...preset,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    return preset;
  }

  async update(
    id: PrescriptionPresetId,
    patch: { name?: string; lines?: RxLineType[]; tags?: string[] },
  ): Promise<PrescriptionPreset | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const names: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':updatedAt': Date.now(),
    };
    const setParts: string[] = ['#updatedAt = :updatedAt'];

    let normalizedName: string | undefined;

    if (patch.name) {
      names['#name'] = 'name';
      values[':name'] = patch.name;
      setParts.push('#name = :name');
      normalizedName = normalizePresetName(patch.name);
      names['#GSI1PK'] = 'GSI1PK';
      names['#GSI1SK'] = 'GSI1SK';
      values[':gsi1pk'] = 'RX_PRESET';
      values[':gsi1sk'] = `NAME#${normalizedName}`;
      setParts.push('#GSI1PK = :gsi1pk', '#GSI1SK = :gsi1sk');
    }

    if (patch.lines) {
      names['#lines'] = 'lines';
      values[':lines'] = patch.lines;
      setParts.push('#lines = :lines');
    }

    if (patch.tags) {
      names['#tags'] = 'tags';
      values[':tags'] = patch.tags;
      setParts.push('#tags = :tags');
    }

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildRxPresetKey(id),
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes) return null;
    return Attributes as PrescriptionPreset;
  }

  async getById(id: PrescriptionPresetId): Promise<PrescriptionPreset | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildRxPresetKey(id),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'RX_PRESET') return null;
    return Item as PrescriptionPreset;
  }
}

export const prescriptionPresetRepository: PrescriptionPresetRepository =
  new DynamoDBPrescriptionPresetRepository();
