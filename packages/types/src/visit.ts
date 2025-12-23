import { z } from 'zod';
import { PatientId } from './patient';
import { UserId } from './user';

export const VisitId = z.string().min(1);
export type VisitId = z.infer<typeof VisitId>;

export const VisitStatus = z.enum(['QUEUED', 'IN_PROGRESS', 'DONE']);
export type VisitStatus = z.infer<typeof VisitStatus>;

export const VisitTag = z.enum(['N', 'F', 'Z']);
export type VisitTag = z.infer<typeof VisitTag>;

export const Visit = z.object({
  visitId: VisitId,
  patientId: PatientId,
  doctorId: UserId,
  reason: z.string().min(1).max(500),
  status: VisitStatus,
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  billingAmount: z.number().nonnegative().optional(),
  tag: VisitTag.optional(),
});
export type Visit = z.infer<typeof Visit>;

export const DoctorQueueItem = Visit.extend({
  patientName: z.string().min(1).optional(),
});
export type DoctorQueueItem = z.infer<typeof DoctorQueueItem>;

export const DoctorQueueResponse = z.object({
  items: z.array(DoctorQueueItem),
});
export type DoctorQueueResponse = z.infer<typeof DoctorQueueResponse>;

export const VisitCreate = z.object({
  patientId: PatientId,
  doctorId: UserId,
  reason: z.string().min(1).max(500),
  tag: VisitTag.optional(),
});
export type VisitCreate = z.infer<typeof VisitCreate>;

export const VisitStatusUpdate = z.object({
  status: VisitStatus,
});
export type VisitStatusUpdate = z.infer<typeof VisitStatusUpdate>;

export const VisitQueueQuery = z.object({
  doctorId: UserId,
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

export const FollowUp = z.object({
  visitId: VisitId,
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500).optional(),
  contactMethod: FollowUpContactMethod,
  status: FollowUpStatus,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type FollowUp = z.infer<typeof FollowUp>;

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
