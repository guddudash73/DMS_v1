import { z } from 'zod';
import { PatientId } from './patient.js';
import { UserId } from './user.js';

export const VisitId = z.string().min(1);
export type VisitId = z.infer<typeof VisitId>;

export const VisitStatus = z.enum(['QUEUED', 'IN_PROGRESS', 'DONE']);
export type VisitStatus = z.infer<typeof VisitStatus>;

export const Visit = z.object({
  visitId: VisitId,
  patientId: PatientId,
  doctorId: UserId,
  reason: z.string().min(1).max(500),
  status: VisitStatus,
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Visit = z.infer<typeof Visit>;

export const VisitCreate = z.object({
  patientId: PatientId,
  doctorId: UserId,
  reason: z.string().min(1).max(500),
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
