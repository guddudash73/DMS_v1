// apps/api/src/lib/httpQuery.ts
import type { Request } from 'express';

/**
 * Express query values can be string | string[] | undefined (and sometimes ParsedQs).
 * We want a single string value, deterministic (first element if array).
 */
export function qString(req: Request, key: string): string | undefined {
  const raw = (req.query as Record<string, unknown>)[key];

  if (typeof raw === 'string') return raw;

  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }

  // Some setups/types use objects for qs parsing — ignore those.
  return undefined;
}

export function qNumber(req: Request, key: string): number | undefined {
  const s = qString(req, key);
  if (!s) return undefined;

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function qTrimmed(req: Request, key: string): string | undefined {
  const s = qString(req, key);
  if (!s) return undefined;
  const t = s.trim();
  return t.length ? t : undefined;
}
