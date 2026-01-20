import serverlessHttp from 'serverless-http';
import { createApp } from './server';

const app = createApp();

/**
 * IMPORTANT:
 * Ensure PDF is returned as binary (base64) through Lambda proxy integrations.
 */
export const handler = serverlessHttp(app, {
  binary: ['application/pdf'],
});
