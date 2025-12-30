// apps/api/src/repositories/prescriptionPresetRepository.ts
import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import {
  PrescriptionPreset as PrescriptionPresetSchema, // ✅ zod schema
  type AdminRxPresetSearchQuery,
  type PrescriptionPreset,
  type PrescriptionPresetId,
  type PrescriptionPresetSearchQuery,
  type RxLineType,
  type PrescriptionPresetScope,
  type RxPresetFilter,
} from '@dms/types';

type DynamoCursor = Record<string, unknown>;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const encodeCursor = (key: DynamoCursor | undefined): string | null => {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64');
};

const decodeCursor = (cursor: string | undefined): DynamoCursor | undefined => {
  if (!cursor) return undefined;
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(raw);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

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
  search(
    params: PrescriptionPresetSearchQuery,
    ctx: { userId: string; role?: string },
  ): Promise<PrescriptionPreset[]>;
  searchAdmin(
    params: AdminRxPresetSearchQuery,
  ): Promise<{ items: PrescriptionPreset[]; total: number; nextCursor: string | null }>;

  create(input: {
    name: string;
    lines: RxLineType[];
    tags?: string[];
    createdByUserId: string;
    scope: PrescriptionPresetScope;
  }): Promise<PrescriptionPreset>;

  update(
    id: PrescriptionPresetId,
    patch: {
      name?: string;
      lines?: RxLineType[];
      tags?: string[];
      scope?: PrescriptionPresetScope;
    },
  ): Promise<PrescriptionPreset | null>;

  getById(id: PrescriptionPresetId): Promise<PrescriptionPreset | null>;
  delete(id: PrescriptionPresetId): Promise<boolean>;
}

export class DynamoDBPrescriptionPresetRepository implements PrescriptionPresetRepository {
  async search(
    params: PrescriptionPresetSearchQuery,
    ctx: { userId: string; role?: string },
  ): Promise<PrescriptionPreset[]> {
    const { query, limit } = params;
    const filter: RxPresetFilter = (params.filter ?? 'ALL') as RxPresetFilter;

    const normalizedQuery = query && query.trim().length > 0 ? normalizePresetName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = { ':pk': 'RX_PRESET' };
    const exprNames: Record<string, string> = {};
    const filterParts: string[] = [];

    if (normalizedQuery) {
      keyCondition += ' AND begins_with(GSI1SK, :skPrefix)';
      exprValues[':skPrefix'] = `NAME#${normalizedQuery}`;
    }

    const isAdmin = ctx.role === 'ADMIN';

    if (!isAdmin) {
      exprNames['#scope'] = 'scope';
      exprNames['#createdByUserId'] = 'createdByUserId';
      exprValues[':privateScope'] = 'PRIVATE';
      exprValues[':me'] = ctx.userId;
      filterParts.push('(#scope <> :privateScope OR #createdByUserId = :me)');
    }

    if (filter === 'MINE') {
      exprNames['#createdByUserId'] = 'createdByUserId';
      exprValues[':me'] = ctx.userId;
      filterParts.push('#createdByUserId = :me');
    }

    if (filter === 'ADMIN') {
      exprNames['#scope'] = 'scope';
      exprValues[':adminScope'] = 'ADMIN';
      filterParts.push('#scope = :adminScope');
    }

    if (filter === 'PUBLIC') {
      exprNames['#scope'] = 'scope';
      exprValues[':publicScope'] = 'PUBLIC';
      filterParts.push('#scope = :publicScope');
    }

    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
        ...(filterParts.length ? { FilterExpression: filterParts.join(' AND ') } : {}),
        ScanIndexForward: true,
        Limit: limit,
      }),
    );

    return (Items ?? [])
      .map((x) => PrescriptionPresetSchema.safeParse(x))
      .filter((r): r is { success: true; data: PrescriptionPreset } => r.success)
      .map((r) => r.data);
  }

  async searchAdmin(
    params: AdminRxPresetSearchQuery,
  ): Promise<{ items: PrescriptionPreset[]; total: number; nextCursor: string | null }> {
    const { query, limit } = params;
    const normalizedQuery = query && query.trim().length > 0 ? normalizePresetName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = { ':pk': 'RX_PRESET' };

    if (normalizedQuery) {
      keyCondition += ' AND begins_with(GSI1SK, :skPrefix)';
      exprValues[':skPrefix'] = `NAME#${normalizedQuery}`;
    }

    let total = 0;
    let countKey: DynamoCursor | undefined = undefined;

    for (;;) {
      const resp = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI1',
          KeyConditionExpression: keyCondition,
          ExpressionAttributeValues: exprValues,
          Select: 'COUNT',
          ExclusiveStartKey: countKey,
        }),
      );
      total += resp.Count ?? 0;
      if (!resp.LastEvaluatedKey) break;
      countKey = resp.LastEvaluatedKey as DynamoCursor;
    }

    const { Items, LastEvaluatedKey } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        ScanIndexForward: true,
        Limit: limit,
        ExclusiveStartKey: decodeCursor(params.cursor),
      }),
    );

    const items = (Items ?? [])
      .map((x) => PrescriptionPresetSchema.safeParse(x))
      .filter((r): r is { success: true; data: PrescriptionPreset } => r.success)
      .map((r) => r.data);

    return {
      items,
      total,
      nextCursor: encodeCursor(LastEvaluatedKey as DynamoCursor | undefined),
    };
  }

  async create(input: {
    name: string;
    lines: RxLineType[];
    tags?: string[];
    createdByUserId: string;
    scope: PrescriptionPresetScope;
  }): Promise<PrescriptionPreset> {
    const now = Date.now();
    const id = randomUUID();
    const normalizedName = normalizePresetName(input.name);

    const preset: PrescriptionPreset = {
      id,
      name: input.name,
      lines: input.lines,
      tags: input.tags,
      scope: input.scope,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
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
    patch: {
      name?: string;
      lines?: RxLineType[];
      tags?: string[];
      scope?: PrescriptionPresetScope;
    },
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

    if (patch.name) {
      names['#name'] = 'name';
      values[':name'] = patch.name;
      setParts.push('#name = :name');

      const normalizedName = normalizePresetName(patch.name);
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

    if (patch.scope) {
      names['#scope'] = 'scope';
      values[':scope'] = patch.scope;
      setParts.push('#scope = :scope');
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildRxPresetKey(id),
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    return await this.getById(id);
  }

  async getById(id: PrescriptionPresetId): Promise<PrescriptionPreset | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildRxPresetKey(id),
        ConsistentRead: true,
      }),
    );

    if (!Item) return null;

    const parsed = PrescriptionPresetSchema.safeParse(Item);
    if (!parsed.success) return null;

    return parsed.data;
  }

  async delete(id: PrescriptionPresetId): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: buildRxPresetKey(id),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    return true;
  }
}

export const prescriptionPresetRepository: PrescriptionPresetRepository =
  new DynamoDBPrescriptionPresetRepository();
