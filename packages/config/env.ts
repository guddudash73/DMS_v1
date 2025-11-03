import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  CORS_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const parseEnv = (raw: NodeJS.ProcessEnv): Env => {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Print all issues once; fail fast to protect runtime
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
};
