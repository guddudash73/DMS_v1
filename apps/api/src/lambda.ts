// apps/api/src/lambda.ts
import serverlessHttp from 'serverless-http';
import { createApp } from './server';

// Reuse your existing Express app
const app = createApp();

// IMPORTANT: Lambda behind CloudFront Router; trust proxy already set in server.ts
export const handler = serverlessHttp(app, {
  // keep default; you can add request/response decoration later if needed
});
