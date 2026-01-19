import type { Request } from 'express';

export function pString(req: Request, key: string): string | undefined {
  const raw = (req.params as Record<string, unknown>)[key];

  if (typeof raw === 'string') return raw;

  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }

  return undefined;
}

export function pRequired(req: Request, key: string): string {
  const v = pString(req, key);
  if (!v || !v.trim()) {
    throw new Error(`MISSING_PARAM:${key}`);
  }
  return v;
}
