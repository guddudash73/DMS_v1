import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.string().optional(),

  AWS_REGION: z.string().min(1),
  DYNAMO_ENDPOINT: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  DDB_TABLE_NAME: z.string().min(1),
  XRAY_BUCKET_NAME: z.string().min(1),

  CORS_ORIGIN: z.string().optional(),

  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 14),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
});

export const parseEnv = (raw: NodeJS.ProcessEnv) => EnvSchema.parse(raw);
export type Env = z.infer<typeof EnvSchema>;
