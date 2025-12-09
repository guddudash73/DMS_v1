import path from 'node:path';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}
import { userRepository } from '../repositories/userRepository';
import { env } from '../config/env';

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
    } catch (err) {
      const errorLike = err as { name?: string; message?: string };

      const name = errorLike.name ?? 'Error';
      const message = errorLike.message ?? String(err);

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
