// packages/types/src/visit.ts
import { z } from 'zod';
import { PatientId } from './patient';

export const VisitId = z.string().min(1);
export type VisitId = z.infer<typeof VisitId>;

export const VisitStatus = z.enum(['QUEUED', 'IN_PROGRESS', 'DONE']);
export type VisitStatus = z.infer<typeof VisitStatus>;

/**
 * ✅ Only N/F are tags now.
 * Z is now represented by zeroBilled: boolean
 */
export const VisitTag = z.enum(['N', 'F']);
export type VisitTag = z.infer<typeof VisitTag>;

export const Visit = z.object({
  visitId: VisitId,
  patientId: PatientId,

  reason: z.string().min(1).max(500),
  status: VisitStatus,
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  opdNo: z.string().min(1).optional(),

  // ✅ NEW: stable daily number (1..N) for that clinic date
  // optional to keep backward compatibility with older records
  dailyPatientNumber: z.number().int().min(1).optional(),

  checkedOut: z.boolean().optional(),
  checkedOutAt: z.number().int().nonnegative().optional(),

  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),

  billingAmount: z.number().nonnegative().optional(),

  tag: VisitTag.optional(),

  zeroBilled: z.boolean().optional(),

  anchorVisitId: VisitId.optional(),

  isOffline: z.boolean().optional(),

  currentRxId: z.string().min(1).optional(),
  currentRxVersion: z.number().int().min(1).optional(),
});
export type Visit = z.infer<typeof Visit>;

export const PatientQueueItem = Visit.extend({
  patientName: z.string().min(1).optional(),
});
export type PatientQueueItem = z.infer<typeof PatientQueueItem>;

export const PatientQueueResponse = z.object({
  items: z.array(PatientQueueItem),
});
export type PatientQueueResponse = z.infer<typeof PatientQueueResponse>;

export const VisitCreate = z
  .object({
    patientId: PatientId,
    reason: z.string().min(1).max(500),

    tag: VisitTag.optional(),

    zeroBilled: z.boolean().optional(),

    anchorVisitId: VisitId.optional(),

    isOffline: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.tag === 'F') {
      if (!val.anchorVisitId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['anchorVisitId'],
          message: 'anchorVisitId is required when tag is F',
        });
      }
    }
  });
export type VisitCreate = z.infer<typeof VisitCreate>;

export const VisitStatusUpdate = z.object({
  status: VisitStatus,
});
export type VisitStatusUpdate = z.infer<typeof VisitStatusUpdate>;

export const VisitQueueQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: VisitStatus.optional(),
});
export type VisitQueueQuery = z.infer<typeof VisitQueueQuery>;

export const FollowUpContactMethod = z.enum(['CALL', 'SMS', 'WHATSAPP', 'OTHER']);
export type FollowUpContactMethod = z.infer<typeof FollowUpContactMethod>;

export const FollowUpStatus = z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']);
export type FollowUpStatus = z.infer<typeof FollowUpStatus>;

export const FollowUpUpsert = z.object({
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500).optional(),
  contactMethod: FollowUpContactMethod.optional(),
});
export type FollowUpUpsert = z.infer<typeof FollowUpUpsert>;

export const FollowUpStatusUpdate = z.object({
  status: FollowUpStatus,
});
export type FollowUpStatusUpdate = z.infer<typeof FollowUpStatusUpdate>;

export const FollowUpId = z.string().min(1);
export type FollowUpId = z.infer<typeof FollowUpId>;

export const FollowUpCreate = z.object({
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500).optional(),
  contactMethod: FollowUpContactMethod.optional(),
});
export type FollowUpCreate = z.infer<typeof FollowUpCreate>;

export const FollowUp = z.object({
  followupId: FollowUpId,
  visitId: VisitId,
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500).optional(),
  contactMethod: FollowUpContactMethod,
  status: FollowUpStatus,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type FollowUp = z.infer<typeof FollowUp>;
