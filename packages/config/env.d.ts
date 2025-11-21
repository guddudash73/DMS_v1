import type { z } from 'zod';

export const EnvSchema: z.ZodTypeAny;
export type Env = z.infer<typeof EnvSchema>;
export function parseEnv(raw: NodeJS.ProcessEnv): Env;
