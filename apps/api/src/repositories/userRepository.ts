import { randomUUID } from 'node:crypto';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoClient, TABLE_NAME } from '../config/aws';
import type { Role, User, DoctorProfile } from '@dms/types';

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const buildUserKey = (userId: string) => ({
  PK: `USER#${userId}`,
  SK: 'META',
});

const buildUserEmailIndexKey = (email: string) => ({
  PK: `USER_EMAIL#${email.toLowerCase()}`,
  SK: 'META',
});

const buildDoctorProfileKey = (doctorId: string) => ({
  PK: `DOCTOR#${doctorId}`,
  SK: 'PROFILE',
});

export interface UserRecord extends User {
  passwordHash: string;
  failedLoginCount: number;
  lockUntil?: number;
}

export interface UserRepository {
  getById(userId: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  createUser(params: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: Role;
  }): Promise<UserRecord>;
  recordFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMs: number,
  ): Promise<UserRecord | null>;
  clearFailedLogins(userId: string): Promise<void>;

  createDoctor(params: {
    email: string;
    displayName: string;
    passwordHash: string;
    fullName: string;
    registrationNumber: string;
    specialization: string;
    contact?: string;
  }): Promise<{ user: UserRecord; doctor: DoctorProfile }>;
  listDoctors(): Promise<Array<DoctorProfile & { email: string; displayName: string }>>;
  updateDoctorProfile(
    doctorId: string,
    patch: Partial<Omit<DoctorProfile, 'doctorId' | 'createdAt'>>,
  ): Promise<DoctorProfile | null>;
}

export class DynamoDBUserRepository implements UserRepository {
  async getById(userId: string): Promise<UserRecord | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildUserKey(userId),
        ConsistentRead: true,
      }),
    );
    if (!Item || Item.entityType !== 'USER') return null;
    return Item as UserRecord;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    const { Item: emailIndex } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildUserEmailIndexKey(email),
      }),
    );
    if (!emailIndex?.userId) return null;
    return this.getById(emailIndex.userId as string);
  }

  async createUser(params: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: Role;
  }): Promise<UserRecord> {
    const { email, displayName, passwordHash, role } = params;
    const userId = randomUUID();
    const now = Date.now();

    const user: UserRecord = {
      userId,
      email,
      displayName,
      role,
      createdAt: now,
      updatedAt: now,
      passwordHash,
      failedLoginCount: 0,
    };

    const userItem = {
      ...buildUserKey(userId),
      entityType: 'USER',
      ...user,
    };

    const emailItem = {
      ...buildUserEmailIndexKey(email),
      entityType: 'USER_EMAIL_INDEX',
      userId,
      createdAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: emailItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: userItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );

    return user;
  }

  async recordFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMs: number,
  ): Promise<UserRecord | null> {
    const existing = await this.getById(userId);
    if (!existing) return null;

    const now = Date.now();
    const nextCount = (existing.failedLoginCount ?? 0) + 1;
    const shouldLock = nextCount >= maxAttempts;

    const names: Record<string, string> = {
      '#failedLoginCount': 'failedLoginCount',
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':count': shouldLock ? 0 : nextCount,
      ':updatedAt': now,
    };
    const parts: string[] = ['#failedLoginCount = :count', '#updatedAt = :updatedAt'];

    if (shouldLock) {
      names['#lockUntil'] = 'lockUntil';
      values[':lockUntil'] = now + lockMs;
      parts.push('#lockUntil = :lockUntil');
    }

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildUserKey(userId),
        UpdateExpression: `SET ${parts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    if (!Attributes) return null;
    return Attributes as UserRecord;
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildUserKey(userId),
        UpdateExpression:
          'REMOVE #lockUntil SET #failedLoginCount = :zero, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#lockUntil': 'lockUntil',
          '#failedLoginCount': 'failedLoginCount',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':updatedAt': Date.now(),
        },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  async createDoctor(params: {
    email: string;
    displayName: string;
    passwordHash: string;
    fullName: string;
    registrationNumber: string;
    specialization: string;
    contact?: string;
  }): Promise<{ user: UserRecord; doctor: DoctorProfile }> {
    const user = await this.createUser({
      email: params.email,
      displayName: params.displayName,
      passwordHash: params.passwordHash,
      role: 'DOCTOR',
    });

    const now = Date.now();
    const doctor: DoctorProfile = {
      doctorId: user.userId,
      fullName: params.fullName,
      registrationNumber: params.registrationNumber,
      specialization: params.specialization,
      contact: params.contact,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...buildDoctorProfileKey(user.userId),
          entityType: 'DOCTOR_PROFILE',
          ...doctor,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    return { user, doctor };
  }

  async listDoctors(): Promise<Array<DoctorProfile & { email: string; displayName: string }>> {
    const { Items } = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#entityType = :type',
        ExpressionAttributeNames: { '#entityType': 'entityType' },
        ExpressionAttributeValues: { ':type': 'DOCTOR_PROFILE' },
      }),
    );

    const doctors = (Items ?? []) as Array<DoctorProfile & { doctorId: string }>;
    const results: Array<DoctorProfile & { email: string; displayName: string }> = [];

    for (const d of doctors) {
      const user = await this.getById(d.doctorId);
      if (!user) continue;
      results.push({
        ...d,
        email: user.email,
        displayName: user.displayName,
      });
    }

    return results;
  }

  async updateDoctorProfile(
    doctorId: string,
    patch: Partial<Omit<DoctorProfile, 'doctorId' | 'createdAt'>>,
  ): Promise<DoctorProfile | null> {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: buildDoctorProfileKey(doctorId),
      }),
    );
    if (!Item || Item.entityType !== 'DOCTOR_PROFILE') return null;

    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': Date.now() };
    const setParts: string[] = ['#updatedAt = :updatedAt'];

    const add = (field: keyof typeof patch & string) => {
      const value = patch[field];
      if (value === undefined) return;
      const n = `#${field}`;
      const v = `:${field}`;
      names[n] = field;
      values[v] = value;
      setParts.push(`${n} = ${v}`);
    };

    add('fullName');
    add('registrationNumber');
    add('specialization');
    add('contact');
    add('active');

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: buildDoctorProfileKey(doctorId),
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    if (!Attributes) return null;
    return Attributes as DoctorProfile;
  }
}

export const userRepository: UserRepository = new DynamoDBUserRepository();
