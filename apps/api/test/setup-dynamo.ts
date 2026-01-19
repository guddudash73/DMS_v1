import { beforeAll } from 'vitest';
import { ensureDynamoTable } from '../src/dev/ensureDynamoTable';
import { seedTestUsers } from './helpers/testUsers';

let done = false;

beforeAll(async () => {
  if (done) return;
  done = true;

  await ensureDynamoTable();
  await seedTestUsers();
});
