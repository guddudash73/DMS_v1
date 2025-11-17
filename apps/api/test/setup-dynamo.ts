import { beforeAll } from 'vitest';
import { ensureDynamoTable } from '../src/dev/ensureDynamoTable';

beforeAll(async () => {
  await ensureDynamoTable();
});
