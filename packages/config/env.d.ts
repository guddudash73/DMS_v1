import { z } from 'zod';
declare const EnvSchema: z.ZodObject<
  {
    NODE_ENV: z.ZodEnum<{
      development: 'development';
      test: 'test';
      production: 'production';
    }>;
    PORT: z.ZodOptional<z.ZodString>;
    AWS_REGION: z.ZodString;
    DYNAMO_ENDPOINT: z.ZodString;
    S3_ENDPOINT: z.ZodString;
    DDB_TABLE_NAME: z.ZodString;
    XRAY_BUCKET_NAME: z.ZodString;
    CORS_ORIGIN: z.ZodOptional<z.ZodString>;
    ACCESS_TOKEN_TTL_SEC: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    REFRESH_TOKEN_TTL_SEC: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    JWT_ACCESS_SECRET: z.ZodString;
    JWT_REFRESH_SECRET: z.ZodString;
  },
  z.core.$strip
>;
export declare const parseEnv: (raw: NodeJS.ProcessEnv) => {
  NODE_ENV: 'development' | 'test' | 'production';
  AWS_REGION: string;
  DYNAMO_ENDPOINT: string;
  S3_ENDPOINT: string;
  DDB_TABLE_NAME: string;
  XRAY_BUCKET_NAME: string;
  ACCESS_TOKEN_TTL_SEC: number;
  REFRESH_TOKEN_TTL_SEC: number;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  PORT?: string | undefined;
  CORS_ORIGIN?: string | undefined;
};
export type Env = z.infer<typeof EnvSchema>;
export {};
//# sourceMappingURL=env.d.ts.map
