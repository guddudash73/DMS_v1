// apps/api/src/repositories/userPreferencesRepository.ts
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { UserPreferences } from '@dms/types';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const buildUserPrefsKey = (userId: string) => ({
  PK: `USER_PREFS#${userId}`,
  SK: 'META',
});

export interface UserPreferencesRepository {
  getByUserId(userId: string): Promise<UserPreferences | null>;
  saveForUser(userId: string, prefs: UserPreferences): Promise<UserPreferences>;
}

class DynamoDBUserPreferencesRepository implements UserPreferencesRepository {
  async getByUserId(userId: string): Promise<UserPreferences | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildUserPrefsKey(userId),
        ConsistentRead: true,
      }),
    );

    if (!Item || Item.entityType !== 'USER_PREFERENCES') return null;

    const { dashboard } = Item as {
      dashboard?: UserPreferences['dashboard'];
    };

    return {
      ...(dashboard ? { dashboard } : {}),
    };
  }

  async saveForUser(userId: string, prefs: UserPreferences): Promise<UserPreferences> {
    const now = Date.now();

    const item = {
      ...buildUserPrefsKey(userId),
      entityType: 'USER_PREFERENCES' as const,
      dashboard: prefs.dashboard ?? undefined,
      updatedAt: now,
      // if you ever care about createdAt, you can add a separate
      // migration/update logic later – for now we keep the shape simple
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    );

    return {
      ...(prefs.dashboard ? { dashboard: prefs.dashboard } : {}),
    };
  }
}

export const userPreferencesRepository: UserPreferencesRepository =
  new DynamoDBUserPreferencesRepository();
