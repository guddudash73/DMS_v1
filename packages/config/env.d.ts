import { z } from 'zod';

export declare const EnvSchema: z.ZodObject<
  {
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
  },
  z.core.$strip
>;

export type Env = z.infer<typeof EnvSchema>;

export declare const parseEnv: (raw: NodeJS.ProcessEnv) => Env;
