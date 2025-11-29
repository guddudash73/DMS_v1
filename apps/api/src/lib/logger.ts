import { randomUUID } from 'node:crypto';
import { AuditEvent as AuditEventSchema } from '@dms/types';
import type { AuditEvent as AuditEventType } from '@dms/types';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface BaseLog {
  t: number;
  level: LogLevel;
  event: string;
  reqId?: string;
  userId?: string;
  [key: string]: unknown;
}

const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'cookie',
  'cookies',
]);

function sanitize(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower = key.toLowerCase();

    if (REDACT_KEYS.has(lower)) {
      out[key] = '[READACTED]';
      continue;
    }

    out[key] = value;
  }

  return out;
}

function writeLog(level: LogLevel, event: string, payload: Record<string, unknown> = {}) {
  const base: BaseLog = {
    t: Date.now(),
    level,
    event,
    ...sanitize(payload),
  };

  console.log(JSON.stringify(base));
}

export function log(event: string, payload: Record<string, unknown> = {}) {
  writeLog('info', event, payload);
}

export function logDebug(event: string, payload: Record<string, unknown> = {}) {
  writeLog('debug', event, payload);
}

export function logInfo(event: string, payload: Record<string, unknown> = {}) {
  writeLog('info', event, payload);
}

export function logWarn(event: string, payload: Record<string, unknown> = {}) {
  writeLog('warn', event, payload);
}

export function logError(event: string, payload: Record<string, unknown> = {}) {
  writeLog('error', event, payload);
}

export function logAudit(
  input: Omit<AuditEventType, 'auditId' | 'ts'> & { auditId?: string; ts?: number },
) {
  const event = AuditEventSchema.parse({
    ...input,
    auditId: input.auditId ?? randomUUID(),
    ts: input.ts ?? Date.now(),
  });

  console.log(
    JSON.stringify({
      stream: 'audit',
      ...event,
    }),
  );
}
