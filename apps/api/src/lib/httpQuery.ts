import type { Request } from 'express';

export function qString(req: Request, key: string): string | undefined {
  const raw = (req.query as Record<string, unknown>)[key];

  if (typeof raw === 'string') return raw;

  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }

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
