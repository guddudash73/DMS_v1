import { randomUUID } from 'node:crypto';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Patient, PatientCreate, PatientUpdate } from '@dms/types';
import { normalizePhone } from '../utils/phone';
import { dynamoClient, TABLE_NAME } from '../config/aws';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const buildPatientKeys = (patientId: string) => ({
  PK: `PATIENT#${patientId}`,
  SK: 'PROFILE',
});

const normalizeNameForUniq = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

// uniqueness index based on (phone + name)
const buildPatientPhoneKeys = (normalizedPhone: string, normalizedName: string) => ({
  PK: `PATIENT_PHONE#${normalizedPhone}#${normalizedName}`,
  SK: 'PROFILE',
});

const normalizeSearchText = (name: string, phone?: string) =>
  `${name} ${phone ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');

export class DuplicatePatientError extends Error {
  readonly code = 'DUPLICATE_PATIENT' as const;

  constructor(message = 'A patient already exists with this name and phone number') {
    super(message);
    this.name = 'DuplicatePatientError';
  }
}

export interface PatientRepository {
  create(input: PatientCreate): Promise<Patient>;
  getById(patientId: string): Promise<Patient | null>;
  update(patientId: string, patch: PatientUpdate): Promise<Patient | null>;
  search(params: { query?: string; limit: number }): Promise<Patient[]>;
}

export class DynamoDBPatientRepository implements PatientRepository {
  async create(input: PatientCreate): Promise<Patient> {
    const patientId = randomUUID();
    const now = Date.now();

    const normalizedPhone = input.phone ? normalizePhone(input.phone) : undefined;
    const normalizedName = normalizeNameForUniq(input.name);

    const item = {
      ...buildPatientKeys(patientId),
      entityType: 'PATIENT',
      patientId,
      name: input.name,
      phone: input.phone,
      dob: input.dob,
      gender: input.gender,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: undefined,
      searchText: normalizeSearchText(input.name, input.phone),
      ...(normalizedPhone ? { normalizedPhone } : {}),
      normalizedName,
    };

    try {
      if (normalizedPhone) {
        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: item,
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: {
                    ...buildPatientPhoneKeys(normalizedPhone, normalizedName),
                    entityType: 'PATIENT_PHONE_INDEX',
                    patientId,
                    createdAt: now,
                  },
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
            ],
          }),
        );
      } else {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: item,
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        );
      }
    } catch (err) {
      if (
        err instanceof ConditionalCheckFailedException ||
        err instanceof TransactionCanceledException
      ) {
        throw new DuplicatePatientError();
      }
      throw err;
    }

    return item as Patient;
  }

  async getById(patientId: string): Promise<Patient | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildPatientKeys(patientId),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'PATIENT') return null;

    const { isDeleted = false, ...rest } = Item as Partial<Patient>;
    if (isDeleted) return null;

    return { ...rest, isDeleted } as Patient;
  }

  async update(patientId: string, patch: PatientUpdate): Promise<Patient | null> {
    const existing = await this.getById(patientId);
    if (!existing) return null;

    const now = Date.now();

    const setParts: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':updatedAt': now,
    };

    const add = (field: keyof PatientUpdate & string) => {
      const value = patch[field];
      if (value === undefined) return;
      const n = `#${field}`;
      const v = `:${field}`;
      names[n] = field;
      values[v] = value;
      setParts.push(`${n} = ${v}`);
    };

    add('name');
    add('phone');
    add('dob');
    add('gender');

    const mergedName = (patch.name ?? existing.name)!;
    const mergedPhone = patch.phone ?? existing.phone;

    if (patch.name !== undefined || patch.phone !== undefined) {
      names['#searchText'] = 'searchText';
      values[':searchText'] = normalizeSearchText(mergedName, mergedPhone);
      setParts.push('#searchText = :searchText');
    }

    const oldNormalizedPhone = existing.phone ? normalizePhone(existing.phone) : undefined;
    const newNormalizedPhone = mergedPhone ? normalizePhone(mergedPhone) : undefined;

    const oldNormalizedName = normalizeNameForUniq(existing.name);
    const newNormalizedName = normalizeNameForUniq(mergedName);

    const phoneChanged = oldNormalizedPhone !== newNormalizedPhone;
    const nameChanged = oldNormalizedName !== newNormalizedName;

    if (!phoneChanged && !nameChanged) {
      const { Attributes } = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: buildPatientKeys(patientId),
          UpdateExpression: `SET ${setParts.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        }),
      );
      if (!Attributes) return null;
      return Attributes as Patient;
    }

    try {
      const updateExpressionParts = [...setParts];

      names['#normalizedName'] = 'normalizedName';
      values[':normalizedName'] = newNormalizedName;
      updateExpressionParts.push('#normalizedName = :normalizedName');

      if (newNormalizedPhone) {
        names['#normalizedPhone'] = 'normalizedPhone';
        values[':normalizedPhone'] = newNormalizedPhone;
        updateExpressionParts.push('#normalizedPhone = :normalizedPhone');
      } else {
        names['#normalizedPhone'] = 'normalizedPhone';
        updateExpressionParts.push('REMOVE #normalizedPhone');
      }

      const transactItems: any[] = [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: buildPatientKeys(patientId),
            UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ConditionExpression: 'attribute_exists(PK)',
          },
        },
      ];

      if (oldNormalizedPhone) {
        transactItems.push({
          Delete: {
            TableName: TABLE_NAME,
            Key: buildPatientPhoneKeys(oldNormalizedPhone, oldNormalizedName),
            ConditionExpression: 'attribute_exists(PK)',
          },
        });
      }

      if (newNormalizedPhone) {
        transactItems.push({
          Put: {
            TableName: TABLE_NAME,
            Item: {
              ...buildPatientPhoneKeys(newNormalizedPhone, newNormalizedName),
              entityType: 'PATIENT_PHONE_INDEX',
              patientId,
              createdAt: existing.createdAt ?? now,
              updatedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        });
      }

      await docClient.send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        }),
      );
    } catch (err) {
      if (
        err instanceof ConditionalCheckFailedException ||
        err instanceof TransactionCanceledException
      ) {
        throw new DuplicatePatientError();
      }
      throw err;
    }

    const updated = await this.getById(patientId);
    return updated;
  }

  async search(params: { query?: string; limit: number }): Promise<Patient[]> {
    const { query, limit } = params;

    const expressionNames: Record<string, string> = {
      '#entityType': 'entityType',
    };
    const expressionValues: Record<string, unknown> = {
      ':patient': 'PATIENT',
    };

    let filterExpression = '#entityType = :patient';

    if (query && query.trim().length > 0) {
      const trimmed = query.trim();
      const digitsOnly = trimmed.replace(/\D/g, '');
      const looksLikePhone = digitsOnly.length >= 7 && /^[+0-9][0-9\s\-()+]*$/.test(trimmed);

      if (looksLikePhone) {
        expressionNames['#phone'] = 'phone';
        expressionValues[':phoneDigits'] = digitsOnly;
        filterExpression += ' AND contains(#phone, :phoneDigits)';
      } else {
        expressionNames['#searchText'] = 'searchText';
        const normalizedQuery = trimmed.toLowerCase().replace(/\s+/g, ' ');
        expressionValues[':query'] = normalizedQuery;
        filterExpression += ' AND contains(#searchText, :query)';
      }
    }

    const { Items } = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      }),
    );

    const all = (Items ?? []) as Patient[];

    const visible = all.filter((p) => (p as any).isDeleted !== true);

    if (visible.length <= limit) {
      return visible;
    }
    return visible.slice(0, limit);
  }
}

export const patientRepository: PatientRepository = new DynamoDBPatientRepository();
