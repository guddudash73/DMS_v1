// apps/api/src/scripts/seed-admin.ts
import bcrypt from 'bcrypt';
import { userRepository } from '../repositories/userRepository';

function mustGet(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

async function main() {
  // Only require what seeding actually needs
  const email = mustGet('ADMIN_EMAIL');
  const password = mustGet('ADMIN_PASSWORD');
  const displayName = process.env.ADMIN_NAME?.trim() || 'Admin';

  // Safety checks: make sure table exists in env (your config/aws.ts reads this)
  // (We don't import getEnv/parseEnv.)
  mustGet('DDB_TABLE_NAME'); // required for TABLE_NAME resolution
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

  console.log('Seeding admin user:', email);

  const existing = await userRepository.getByEmail(email);
  if (existing) {
    console.log('✅ Admin already exists:', {
      userId: existing.userId,
      email: existing.email,
      role: existing.role,
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await userRepository.createUser({
    email,
    displayName,
    passwordHash,
    role: 'ADMIN',
    active: true,
  });

  console.log('Admin user created:', {
    userId: user.userId,
    email: user.email,
    role: user.role,
  });

  console.log('✅ Admin seeding complete');
}

main().catch((err) => {
  console.error('❌ Admin seeding failed');
  console.error(err);
  process.exit(1);
});
