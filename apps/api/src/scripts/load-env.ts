import path from 'node:path';
import dotenv from 'dotenv';

const apiEnvPath = path.resolve(__dirname, '../../.env');

console.log('[seed-dashboard-demo] loading env from', apiEnvPath);

dotenv.config({
  path: apiEnvPath,
});

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}
