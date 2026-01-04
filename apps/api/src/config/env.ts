// apps/api/src/config/env.ts
import { parseEnv, type Env } from '@dms/config';

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
