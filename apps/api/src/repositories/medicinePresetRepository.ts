// apps/api/src/repositories/medicinePresetRepository.ts
import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import {
  MedicinePreset as MedicinePresetSchema,
  type AdminMedicineSearchQuery,
  type AdminUpdateMedicineRequest,
  type DoctorUpdateMedicineRequest,
  type MedicinePreset,
  type MedicineTypeaheadItem,
  type QuickAddMedicineInput,
} from '@dcm/types';

type DynamoCursor = Record<string, unknown>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const getStringProp = (v: unknown, key: string): string | undefined =>
  isObject(v) && typeof v[key] === 'string' ? (v[key] as string) : undefined;

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

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

const canDoctorMutate = (m: MedicinePreset, userId: string) =>
  m.source === 'INLINE_DOCTOR' && m.createdByUserId === userId;

export interface MedicinePresetRepository {
  search(params: { query?: string; limit: number }): Promise<MedicineTypeaheadItem[]>;

  quickAdd(params: {
    input: QuickAddMedicineInput;
    createdByUserId: string;
    source: 'ADMIN_IMPORT' | 'INLINE_DOCTOR';
  }): Promise<MedicinePreset>;

  catalogList(params: {
    query?: string;
    limit: number;
    cursor?: string;
    viewerUserId: string;
  }): Promise<{ items: MedicinePreset[]; nextCursor: string | null }>;

  doctorUpdate(
    id: string,
    patch: DoctorUpdateMedicineRequest,
    userId: string,
  ): Promise<MedicinePreset | null | 'FORBIDDEN'>;

  doctorDelete(id: string, userId: string): Promise<boolean | 'FORBIDDEN'>;

  adminList(
    params: AdminMedicineSearchQuery,
  ): Promise<{ items: MedicinePreset[]; total: number; nextCursor: string | null }>;

  getById(id: string): Promise<MedicinePreset | null>;

  adminUpdate(id: string, patch: AdminUpdateMedicineRequest): Promise<MedicinePreset | null>;

  adminDelete(id: string): Promise<boolean>;
}

export class DynamoDBMedicinePresetRepository implements MedicinePresetRepository {
  /**
   * ✅ Used by prescription medicine combobox/typeahead
   * Must include defaults so the frontend can auto-populate fields on selection.
   *
   * ✅ Includes:
   * - amountPerDose
   * - defaultTiming
   * - defaultNotes
   */
  async search(params: { query?: string; limit: number }): Promise<MedicineTypeaheadItem[]> {
    const { query, limit } = params;

    const normalizedQuery = query && query.trim().length > 0 ? normalizeMedicineName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = { ':pk': 'MEDICINE_PRESET' };

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

    const parsed = (Items ?? [])
      .map((x) => MedicinePresetSchema.safeParse(x))
      .filter((r): r is { success: true; data: MedicinePreset } => r.success)
      .map((r) => r.data);

    return parsed.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      defaultDose: p.defaultDose,
      amountPerDose: p.amountPerDose,
      defaultFrequency: p.defaultFrequency,
      defaultQuantity: p.defaultQuantity,
      defaultTiming: (p as any).defaultTiming,
      defaultNotes: (p as any).defaultNotes,
      medicineType: p.medicineType,
    }));
  }

  async catalogList(params: {
    query?: string;
    limit: number;
    cursor?: string;
    viewerUserId: string;
  }): Promise<{ items: MedicinePreset[]; nextCursor: string | null }> {
    const { query, limit, cursor, viewerUserId } = params;
    const normalizedQuery = query && query.trim().length > 0 ? normalizeMedicineName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = {
      ':pk': 'MEDICINE_PRESET',
      ':verifiedTrue': true,
      ':me': viewerUserId,
    };

    if (normalizedQuery) {
      keyCondition += ' AND begins_with(GSI1SK, :skPrefix)';
      exprValues[':skPrefix'] = `NAME#${normalizedQuery}`;
    }

    // Viewer can see: verified OR createdByMe
    const filterExpression = 'verified = :verifiedTrue OR createdByUserId = :me';

    const { Items, LastEvaluatedKey } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        FilterExpression: filterExpression,
        ScanIndexForward: true,
        Limit: limit,
        ExclusiveStartKey: decodeCursor(cursor),
      }),
    );

    const items = (Items ?? [])
      .map((x) => MedicinePresetSchema.safeParse(x))
      .filter((r): r is { success: true; data: MedicinePreset } => r.success)
      .map((r) => r.data);

    return { items, nextCursor: encodeCursor(LastEvaluatedKey as DynamoCursor | undefined) };
  }

  async adminList(
    params: AdminMedicineSearchQuery,
  ): Promise<{ items: MedicinePreset[]; total: number; nextCursor: string | null }> {
    const { query, limit, status } = params;
    const normalizedQuery = query && query.trim().length > 0 ? normalizeMedicineName(query) : '';

    let keyCondition = 'GSI1PK = :pk';
    const exprValues: Record<string, unknown> = { ':pk': 'MEDICINE_PRESET' };

    if (normalizedQuery) {
      keyCondition += ' AND begins_with(GSI1SK, :skPrefix)';
      exprValues[':skPrefix'] = `NAME#${normalizedQuery}`;
    }

    const wantsFilter = status === 'VERIFIED' || status === 'PENDING';
    const filterExpression = wantsFilter ? 'verified = :verified' : undefined;
    if (status === 'VERIFIED') exprValues[':verified'] = true;
    if (status === 'PENDING') exprValues[':verified'] = false;

    // total count (paged)
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
          ...(filterExpression ? { FilterExpression: filterExpression } : {}),
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
        ...(filterExpression ? { FilterExpression: filterExpression } : {}),
        ScanIndexForward: true,
        Limit: limit,
        ExclusiveStartKey: decodeCursor(params.cursor),
      }),
    );

    const items = (Items ?? [])
      .map((x) => MedicinePresetSchema.safeParse(x))
      .filter((r): r is { success: true; data: MedicinePreset } => r.success)
      .map((r) => r.data);

    const nextCursor = encodeCursor(LastEvaluatedKey as DynamoCursor | undefined);
    return { items, total, nextCursor };
  }

  async getById(id: string): Promise<MedicinePreset | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildMedicinePresetKey(id),
        ConsistentRead: true,
      }),
    );

    if (!Item) return null;

    const parsed = MedicinePresetSchema.safeParse(Item);
    if (!parsed.success) return null;

    return parsed.data;
  }

  async adminUpdate(id: string, patch: AdminUpdateMedicineRequest): Promise<MedicinePreset | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const wantsRename =
      typeof patch.displayName === 'string' && patch.displayName.trim().length > 0;

    if (wantsRename) {
      const newDisplayName = patch.displayName!.trim();
      const newNormalized = normalizeMedicineName(newDisplayName);
      const oldNormalized = existing.normalizedName;

      if (newNormalized !== oldNormalized) {
        const now = Date.now();

        const updateNames: Record<string, string> = {
          '#displayName': 'displayName',
          '#normalizedName': 'normalizedName',
          '#GSI1PK': 'GSI1PK',
          '#GSI1SK': 'GSI1SK',
          '#updatedAt': 'updatedAt',
        };

        const updateValues: Record<string, unknown> = {
          ':displayName': newDisplayName,
          ':normalizedName': newNormalized,
          ':gsi1pk': 'MEDICINE_PRESET',
          ':gsi1sk': `NAME#${newNormalized}`,
          ':updatedAt': now,
        };

        const setParts: string[] = [
          '#displayName = :displayName',
          '#normalizedName = :normalizedName',
          '#GSI1PK = :gsi1pk',
          '#GSI1SK = :gsi1sk',
          '#updatedAt = :updatedAt',
        ];

        const applyOptional = (attr: string, value: unknown) => {
          if (value === undefined) return;
          updateNames[`#${attr}`] = attr;
          updateValues[`:${attr}`] = value;
          setParts.push(`#${attr} = :${attr}`);
        };

        applyOptional('defaultDose', patch.defaultDose);
        applyOptional('amountPerDose', patch.amountPerDose);
        applyOptional('defaultFrequency', patch.defaultFrequency);
        applyOptional('defaultQuantity', patch.defaultQuantity);
        applyOptional('defaultTiming', patch.defaultTiming);
        applyOptional('defaultNotes', patch.defaultNotes);
        applyOptional('medicineType', patch.medicineType);
        applyOptional('tags', patch.tags);
        applyOptional('verified', patch.verified);

        const newNameIndexItem = {
          ...buildMedicineNameIndexKey(newNormalized),
          entityType: 'MEDICINE_NAME_INDEX',
          medicinePresetId: id,
          createdAt: existing.createdAt,
          updatedAt: now,
        };

        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: newNameIndexItem,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: buildMedicinePresetKey(id),
                  UpdateExpression: `SET ${setParts.join(', ')}`,
                  ExpressionAttributeNames: updateNames,
                  ExpressionAttributeValues: updateValues,
                  ConditionExpression: 'attribute_exists(PK)',
                },
              },
              {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: buildMedicineNameIndexKey(oldNormalized),
                  ConditionExpression: 'attribute_exists(PK)',
                },
              },
            ],
          }),
        );

        return await this.getById(id);
      }
    }

    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': Date.now() };
    const setParts: string[] = ['#updatedAt = :updatedAt'];

    const applyOptional = (attr: string, value: unknown) => {
      if (value === undefined) return;
      names[`#${attr}`] = attr;
      values[`:${attr}`] = value;
      setParts.push(`#${attr} = :${attr}`);
    };

    applyOptional('displayName', patch.displayName);
    applyOptional('defaultDose', patch.defaultDose);
    applyOptional('amountPerDose', patch.amountPerDose);
    applyOptional('defaultFrequency', patch.defaultFrequency);
    applyOptional('defaultQuantity', patch.defaultQuantity);
    applyOptional('defaultTiming', patch.defaultTiming);
    applyOptional('defaultNotes', patch.defaultNotes);
    applyOptional('medicineType', patch.medicineType);
    applyOptional('tags', patch.tags);
    applyOptional('verified', patch.verified);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildMedicinePresetKey(id),
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    return await this.getById(id);
  }

  async adminDelete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: buildMedicinePresetKey(id),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: buildMedicineNameIndexKey(existing.normalizedName),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return true;
  }

  async doctorUpdate(
    id: string,
    patch: DoctorUpdateMedicineRequest,
    userId: string,
  ): Promise<MedicinePreset | null | 'FORBIDDEN'> {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (!canDoctorMutate(existing, userId)) return 'FORBIDDEN';

    const wantsRename =
      typeof patch.displayName === 'string' && patch.displayName.trim().length > 0;

    if (wantsRename) {
      const newDisplayName = patch.displayName!.trim();
      const newNormalized = normalizeMedicineName(newDisplayName);
      const oldNormalized = existing.normalizedName;

      if (newNormalized !== oldNormalized) {
        const now = Date.now();

        const updateNames: Record<string, string> = {
          '#displayName': 'displayName',
          '#normalizedName': 'normalizedName',
          '#GSI1PK': 'GSI1PK',
          '#GSI1SK': 'GSI1SK',
          '#updatedAt': 'updatedAt',
        };

        const updateValues: Record<string, unknown> = {
          ':displayName': newDisplayName,
          ':normalizedName': newNormalized,
          ':gsi1pk': 'MEDICINE_PRESET',
          ':gsi1sk': `NAME#${newNormalized}`,
          ':updatedAt': now,
        };

        const setParts: string[] = [
          '#displayName = :displayName',
          '#normalizedName = :normalizedName',
          '#GSI1PK = :gsi1pk',
          '#GSI1SK = :gsi1sk',
          '#updatedAt = :updatedAt',
        ];

        const applyOptional = (attr: string, value: unknown) => {
          if (value === undefined) return;
          updateNames[`#${attr}`] = attr;
          updateValues[`:${attr}`] = value;
          setParts.push(`#${attr} = :${attr}`);
        };

        applyOptional('defaultDose', patch.defaultDose);
        applyOptional('amountPerDose', patch.amountPerDose);
        applyOptional('defaultFrequency', patch.defaultFrequency);
        applyOptional('defaultQuantity', patch.defaultQuantity);
        applyOptional('defaultTiming', patch.defaultTiming);
        applyOptional('defaultNotes', patch.defaultNotes);
        applyOptional('medicineType', patch.medicineType);

        const newNameIndexItem = {
          ...buildMedicineNameIndexKey(newNormalized),
          entityType: 'MEDICINE_NAME_INDEX',
          medicinePresetId: id,
          createdAt: existing.createdAt,
          updatedAt: now,
        };

        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: newNameIndexItem,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: buildMedicinePresetKey(id),
                  UpdateExpression: `SET ${setParts.join(', ')}`,
                  ExpressionAttributeNames: updateNames,
                  ExpressionAttributeValues: updateValues,
                  ConditionExpression: 'attribute_exists(PK)',
                },
              },
              {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: buildMedicineNameIndexKey(oldNormalized),
                  ConditionExpression: 'attribute_exists(PK)',
                },
              },
            ],
          }),
        );

        return await this.getById(id);
      }
    }

    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': Date.now() };
    const setParts: string[] = ['#updatedAt = :updatedAt'];

    const applyOptional = (attr: string, value: unknown) => {
      if (value === undefined) return;
      names[`#${attr}`] = attr;
      values[`:${attr}`] = value;
      setParts.push(`#${attr} = :${attr}`);
    };

    applyOptional('displayName', patch.displayName);
    applyOptional('defaultDose', patch.defaultDose);
    applyOptional('amountPerDose', patch.amountPerDose);
    applyOptional('defaultFrequency', patch.defaultFrequency);
    applyOptional('defaultQuantity', patch.defaultQuantity);
    applyOptional('defaultTiming', patch.defaultTiming);
    applyOptional('defaultNotes', patch.defaultNotes);
    applyOptional('medicineType', patch.medicineType);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildMedicinePresetKey(id),
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );

    return await this.getById(id);
  }

  async doctorDelete(id: string, userId: string): Promise<boolean | 'FORBIDDEN'> {
    const existing = await this.getById(id);
    if (!existing) return false;
    if (!canDoctorMutate(existing, userId)) return 'FORBIDDEN';

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: buildMedicinePresetKey(id),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: buildMedicineNameIndexKey(existing.normalizedName),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );

    return true;
  }

  /**
   * ✅ Quick add persists defaults:
   * - amountPerDose
   * - defaultTiming
   * - defaultNotes
   */
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

    const presetIdFromIndex = getStringProp(existingNameIndex.Item, 'medicinePresetId');

    if (presetIdFromIndex) {
      const { Item } = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: buildMedicinePresetKey(presetIdFromIndex),
          ConsistentRead: true,
        }),
      );

      if (Item) {
        const parsed = MedicinePresetSchema.safeParse(Item);
        if (parsed.success) return parsed.data;
      }
    }

    const now = Date.now();
    const id = randomUUID();

    const preset: MedicinePreset = {
      id,
      displayName: input.displayName,
      normalizedName,

      defaultDose: input.defaultDose,
      amountPerDose: input.amountPerDose,
      defaultFrequency: input.defaultFrequency,
      defaultQuantity: input.defaultQuantity,

      defaultTiming: input.defaultTiming,
      defaultNotes: input.defaultNotes,

      medicineType: input.medicineType,

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
