// apps/api/scripts/seed-test-users.ts
import path from 'node:path';
import dotenv from 'dotenv';

// 1) Load .env from apps/api/.env
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

// 2) Ensure NODE_ENV is something EnvSchema accepts
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

type Role = 'ADMIN' | 'DOCTOR' | 'RECEPTION';

interface SeedUser {
  email: string;
  password: string;
  displayName: string;
  role: Role;
}

const seedUsers: SeedUser[] = [
  {
    email: 'admin@example.com',
    password: 'AdminPass123!',
    displayName: 'Admin User',
    role: 'ADMIN',
  },
  {
    email: 'doctor@example.com',
    password: 'DoctorPass123!',
    displayName: 'Doctor User',
    role: 'DOCTOR',
  },
  {
    email: 'reception@example.com',
    password: 'ReceptionPass123!',
    displayName: 'Reception User',
    role: 'RECEPTION',
  },
];

async function main() {
  // 3) Only now import modules that depend on parsed env
  const bcryptModule = await import('bcrypt');
  const bcrypt = (bcryptModule as any).default ?? bcryptModule;

  const { userRepository } = await import('../src/repositories/userRepository');
  const { env } = await import('../src/config/env');

  console.log(
    `[seed-test-users] NODE_ENV=${env.NODE_ENV}, table=${env.DDB_TABLE_NAME}, region=${env.AWS_REGION}`,
  );

  for (const u of seedUsers) {
    const hash = await bcrypt.hash(u.password, 10);

    try {
      const created = await userRepository.createUser({
        email: u.email,
        displayName: u.displayName,
        passwordHash: hash,
        role: u.role,
      });

      console.log(`[seed-test-users] created ${u.role} user`, u.email, '→ userId=', created.userId);
    } catch (err: any) {
      const name = err?.name ?? 'Error';
      const message = err?.message ?? String(err);

      if (name === 'TransactionCanceledException') {
        console.log(`[seed-test-users] ${u.email} already exists (TransactionCanceled), skipping`);
      } else {
        console.error(`[seed-test-users] failed to create ${u.email}:`, name, message);
      }
    }
  }

  console.log('[seed-test-users] done.');
}

main().catch((err) => {
  console.error('[seed-test-users] fatal error:', err);
  process.exit(1);
});
