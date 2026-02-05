// apps\api\src\repositories\assistantRepository.ts
import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand, // ✅ ADD
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { Assistant, AssistantCreate, AssistantUpdate } from '@dcm/types';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const pk = (assistantId: string) => `ASSISTANT#${assistantId}`;

export interface AssistantRepository {
  create(input: AssistantCreate): Promise<Assistant>;
  getById(assistantId: string): Promise<Assistant | null>;
  listActiveFirst(): Promise<Assistant[]>;
  update(assistantId: string, input: AssistantUpdate): Promise<Assistant | null>;
  delete(assistantId: string): Promise<boolean>; // ✅ ADD
}

export class DynamoDBAssistantRepository implements AssistantRepository {
  async create(input: AssistantCreate): Promise<Assistant> {
    const now = Date.now();
    const assistantId = randomUUID();

    const item: Assistant & {
      PK: string;
      SK: string;
      entityType: string;
      GSI1PK: string;
      GSI1SK: string;
    } = {
      assistantId,
      name: input.name.trim(),
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,

      PK: pk(assistantId),
      SK: 'META',
      entityType: 'ASSISTANT',

      GSI1PK: 'ASSISTANTS',
      GSI1SK: `NAME#${input.name.trim().toLowerCase()}#ID#${assistantId}`,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    const { PK, SK, entityType, GSI1PK, GSI1SK, ...clean } = item;
    return clean;
  }

  async getById(assistantId: string): Promise<Assistant | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(assistantId), SK: 'META' },
        ConsistentRead: true,
      }),
    );
    if (!Item || (Item as any).entityType !== 'ASSISTANT') return null;

    const { PK, SK, entityType, GSI1PK, GSI1SK, ...clean } = Item as any;
    return clean as Assistant;
  }

  async listActiveFirst(): Promise<Assistant[]> {
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'ASSISTANTS' },
        ScanIndexForward: true,
      }),
    );

    const rows = (Items ?? [])
      .filter((it) => (it as any).entityType === 'ASSISTANT')
      .map((it: any) => {
        const { PK, SK, entityType, GSI1PK, GSI1SK, ...clean } = it;
        return clean as Assistant;
      });

    rows.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return rows;
  }

  async update(assistantId: string, input: AssistantUpdate): Promise<Assistant | null> {
    const now = Date.now();

    const sets: string[] = ['#updatedAt = :now'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':now': now };

    if (typeof input.name === 'string') {
      sets.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = input.name.trim();

      sets.push('#gsi1sk = :gsi1sk');
      names['#gsi1sk'] = 'GSI1SK';
      values[':gsi1sk'] = `NAME#${input.name.trim().toLowerCase()}#ID#${assistantId}`;
    }

    if (typeof input.active === 'boolean') {
      sets.push('#active = :active');
      names['#active'] = 'active';
      values[':active'] = input.active;
    }

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(assistantId), SK: 'META' },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes) return null;
    const { PK, SK, entityType, GSI1PK, GSI1SK, ...clean } = Attributes as any;
    return clean as Assistant;
  }

  async delete(assistantId: string): Promise<boolean> {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk(assistantId), SK: 'META' },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
    return true;
  }
}

export const assistantRepository: AssistantRepository = new DynamoDBAssistantRepository();
