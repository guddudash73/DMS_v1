import { parseEnv } from '@dms/config';

export const env = parseEnv(process.env);

export const {
  NODE_ENV,
  PORT,
  CORS_ORIGIN,
  AWS_REGION,
  DYNAMO_ENDPOINT,
  S3_ENDPOINT,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  DDB_TABLE_NAME,
  XRAY_BUCKET_NAME,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
} = env;
