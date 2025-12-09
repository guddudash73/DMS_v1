// apps/api/scripts/load-env.ts
import path from 'node:path';
import dotenv from 'dotenv';

// __dirname here = apps/api/scripts
const apiEnvPath = path.resolve(__dirname, '../../.env');
// if your .env is apps/api/.env

console.log('[seed-dashboard-demo] loading env from', apiEnvPath);

dotenv.config({
  path: apiEnvPath,
});

// safety: default NODE_ENV if missing
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}
