import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  CORS_ORIGIN: z.string().url().optional(),

  AWS_REGION: z.string().default('us-east-1'),
  DYNAMO_ENDPOINT: z.string().url().default('http://localhost:8000'),
  S3_ENDPOINT: z.string().url().default('http://localhost:4566'),

  ACCESS_TOKEN_TTL_SEC: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().default(1209600),
});

export type Env = z.infer<typeof EnvSchema>;

export const parseEnv = (raw: NodeJS.ProcessEnv): Env => {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
};
