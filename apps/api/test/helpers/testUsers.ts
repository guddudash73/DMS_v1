import bcrypt from 'bcrypt';
import { userRepository } from '../../src/repositories/userRepository';

export const TEST_USERS = {
  admin: {
    email: 'admin@test.local',
    password: 'AdminPass123!',
    displayName: 'Test Admin',
    role: 'ADMIN' as const,
  },
  doctor: {
    email: 'doctor@test.local',
    password: 'DoctorPass123!',
    displayName: 'Test Doctor',
    role: 'DOCTOR' as const,
  },
  reception: {
    email: 'reception@test.local',
    password: 'ReceptionPass123!',
    displayName: 'Test Reception',
    role: 'RECEPTION' as const,
  },
};

export const TEST_USER_IDS: Record<keyof typeof TEST_USERS, string> = {
  admin: '',
  doctor: '',
  reception: '',
};

function isDynamoConditionalFailure(err: unknown): boolean {
  const e = err as any;
  return (
    e?.name === 'TransactionCanceledException' ||
    e?.name === 'ConditionalCheckFailedException' ||
    String(e?.message ?? '').includes('ConditionalCheckFailed')
  );
}

async function ensureUser(key: keyof typeof TEST_USERS) {
  const u = TEST_USERS[key];

  const existing = await userRepository.getByEmail(u.email);
  if (existing) {
    TEST_USER_IDS[key] = existing.userId;
    return;
  }

  const passwordHash = await bcrypt.hash(u.password, 10);

  try {
    const created = await userRepository.createUser({
      email: u.email,
      displayName: u.displayName,
      passwordHash,
      role: u.role,
      active: true,
    });

    TEST_USER_IDS[key] = created.userId;
    return;
  } catch (err) {
    if (!isDynamoConditionalFailure(err)) throw err;

    const after = await userRepository.getByEmail(u.email);
    if (!after) throw err;

    TEST_USER_IDS[key] = after.userId;
    return;
  }
}

export async function seedTestUsers() {
  await Promise.all([ensureUser('admin'), ensureUser('doctor'), ensureUser('reception')]);
}
