// packages/config/src/env.ts
import { z } from 'zod';

export {};

// Helpers
const isNonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

const NodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

const EnvSchema = z
  .object({
    NODE_ENV: NodeEnvSchema,

    // Server
    PORT: z.string().optional(),

    // App/infra
    APP_REGION: z.string().min(1).default('us-east-1'),

    // Endpoints are OPTIONAL (prod uses AWS defaults).
    // In dev/test you can provide DynamoDB Local / localstack endpoints.
    DYNAMO_ENDPOINT: z.string().min(1).optional(),
    S3_ENDPOINT: z.string().min(1).optional(),
    S3_PUBLIC_ENDPOINT: z.string().min(1).optional(),

    // Required in all envs (because app uses these at runtime).
    DDB_TABLE_NAME: z.string().min(1),
    XRAY_BUCKET_NAME: z.string().min(1),

    // CORS
    CORS_ORIGIN: z.string().optional(),

    // Auth TTLs
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SEC: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24),

    // JWT secrets:
    // - REQUIRED in production
    // - Defaults in development/test to keep local running out-of-the-box
    JWT_ACCESS_SECRET: z.string().optional(),
    JWT_REFRESH_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === 'production';

    if (isProd) {
      // In prod: must be present and strong
      if (!isNonEmpty(env.JWT_ACCESS_SECRET) || (env.JWT_ACCESS_SECRET?.length ?? 0) < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET is required in production and must be at least 32 chars.',
        });
      }
      if (!isNonEmpty(env.JWT_REFRESH_SECRET) || (env.JWT_REFRESH_SECRET?.length ?? 0) < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'JWT_REFRESH_SECRET is required in production and must be at least 32 chars.',
        });
      }
      return;
    }

    // In dev/test: provide safe defaults if missing (keeps current dev behavior working)
    // (Still long enough to satisfy downstream validations.)
    if (!isNonEmpty(env.JWT_ACCESS_SECRET)) {
      env.JWT_ACCESS_SECRET = 'dev-access-secret-please-change-this-32chars+';
    }
    if (!isNonEmpty(env.JWT_REFRESH_SECRET)) {
      env.JWT_REFRESH_SECRET = 'dev-refresh-secret-please-change-this-32chars+';
    }
  });

export const parseEnv = (raw: NodeJS.ProcessEnv) => EnvSchema.parse(raw);
export type Env = z.infer<typeof EnvSchema>;
