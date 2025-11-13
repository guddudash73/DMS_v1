import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { AWS_REGION, DYNAMO_ENDPOINT, DDB_TABLE_NAME } from '../config/env';
import type { Patient, PatientCreate, PatientUpdate } from '@dms/types';

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

const buildPatientKeys = (patientId: string) => ({
  PK: `PATIENT#${patientId}`,
  SK: `PROFILE`,
});

const normalizeSearchText = (name: string, phone?: string) =>
  `${name} ${phone ?? ''}`.trim().toLowerCase().replace(/\s+/g, '');

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
      searchText: normalizeSearchText(input.name, input.phone),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

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
    return Item as Patient;
  }

  async update(patientId: string, patch: PatientUpdate): Promise<Patient | null> {
    const setParts: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':updatedAt': Date.now(),
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

    let updateSearchText = false;
    if (patch.name || patch.phone) {
      updateSearchText = true;
    }

    if (updateSearchText) {
      const existing = await this.getById(patientId);
      if (!existing) return null;

      const mergedName = patch.name ?? existing.name;
      const mergedPhone = patch.phone ?? existing.phone;

      names['#searchText'] = 'searchText';
      values[':searchText'] = normalizeSearchText(mergedName, mergedPhone);
      setParts.push('#searchText = :searchText');
    }

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
      expressionNames['#searchText'] = 'searchText';
      expressionValues[':query'] = query.trim().toLowerCase();
      filterExpression += ' AND contains(#searchText, :query)';
    }

    const { Items } = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: limit,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      }),
    );

    return (Items ?? []) as Patient[];
  }
}

export const patientRepository: PatientRepository = new DynamoDBPatientRepository();
