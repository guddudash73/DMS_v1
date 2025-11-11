import { z } from 'zod';
import { PatientId } from './patient.js';

export const VisitId = z.string().min(1);
export type VisitId = z.infer<typeof VisitId>;

export const VisitStatus = z.enum(['QUEUED', 'IN_PROGRESS', 'DONE']);
export type VisitStatus = z.infer<typeof VisitStatus>;

export const Visit = z.object({
  visitId: VisitId,
  patientId: PatientId,
  doctorId: z.string().min(1),
  reason: z.string().min(1),
  status: VisitStatus,
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Visit = z.infer<typeof Visit>;
