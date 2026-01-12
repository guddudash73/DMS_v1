// packages/types/src/print.ts
import { z } from 'zod';
import { PatientGender } from './patient';

export const VisitTagForPrint = z.enum(['N', 'F', 'Z']);
export type VisitTagForPrint = z.infer<typeof VisitTagForPrint>;

export const TokenPrintPayload = z.object({
  clinicName: z.string().min(1).max(80).optional(),
  clinicPhone: z.string().min(1).max(30).optional(),

  tokenNumber: z.number().int().min(1),
  visitId: z.string().min(1),

  patientName: z.string().min(1).max(120),
  patientPhone: z.string().min(1).max(30).optional(),

  reason: z.string().min(1).max(500),
  tag: VisitTagForPrint.optional(),

  visitNumberForPatient: z.number().int().min(1),

  createdAt: z.number().int().nonnegative(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  // ✅ NEW: stable daily number + identifiers + demographics (for token printing)
  dailyPatientNumber: z.number().int().min(1).optional(),
  opdNo: z.string().min(1).optional(),
  sdId: z.string().min(1).optional(),
  patientDob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  patientGender: PatientGender.optional(),

  // keep compatibility for offline printing
  isOffline: z.boolean().optional(),
});

export type TokenPrintPayload = z.infer<typeof TokenPrintPayload>;
