import { z } from 'zod';
import { UserId } from './user';

export const AuditId = z.string().min(1);
export type AuditId = z.infer<typeof AuditId>;

export const AuditEvent = z.object({
  auditId: AuditId,
  actorUserId: UserId,
  action: z.string().min(1),
  entity: z.object({
    type: z.enum(['PATIENT', 'VISIT', 'XRAY', 'RX', 'USER']),
    id: z.string().min(1),
  }),
  meta: z.record(z.string(), z.unknown()).optional(),
  ts: z.number().int().nonnegative(),
});

export type AuditEvent = z.infer<typeof AuditEvent>;
