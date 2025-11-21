import { z } from 'zod';

export const EnvSchema: z.ZodObject<{
  NODE_ENV: z.ZodDefault<
    z.ZodEnum<{
      development: 'development';
      test: 'test';
      production: 'production';
    }>
  >;
  PORT: z.ZodDefault<z.ZodString>;
  CORS_ORIGIN: z.ZodOptional<z.ZodString>;
  AWS_REGION: z.ZodDefault<z.ZodString>;
  DYNAMO_ENDPOINT: z.ZodDefault<z.ZodString>;
  S3_ENDPOINT: z.ZodDefault<z.ZodString>;
  XRAY_BUCKET_NAME: z.ZodString;
  ACCESS_TOKEN_TTL_SEC: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
  REFRESH_TOKEN_TTL_SEC: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
  DDB_TABLE_NAME: z.ZodString;
}, z.ZodUnknown, z.ZodTypeAny, {
  XRAY_BUCKET_NAME: string;
  NODE_ENV?: 'development' | 'test' | 'production' | undefined;
  PORT?: string | undefined;
  CORS_ORIGIN?: string | undefined;
  AWS_REGION?: string | undefined;
  DYNAMO_ENDPOINT?: string | undefined;
  S3_ENDPOINT?: string | undefined;
  ACCESS_TOKEN_TTL_SEC?: string | number | undefined;
  REFRESH_TOKEN_TTL_SEC?: string | number | undefined;
  DDB_TABLE_NAME?: string | undefined;
}, {
  XRAY_BUCKET_NAME: string;
  NODE_ENV?: 'development' | 'test' | 'production' | undefined;
  PORT?: string | undefined;
  CORS_ORIGIN?: string | undefined;
  AWS_REGION?: string | undefined;
  DYNAMO_ENDPOINT?: string | undefined;
  S3_ENDPOINT?: string | undefined;
  ACCESS_TOKEN_TTL_SEC?: string | number | undefined;
  REFRESH_TOKEN_TTL_SEC?: string | number | undefined;
  DDB_TABLE_NAME?: string | undefined;
}>;

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Env;
