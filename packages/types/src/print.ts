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
  dailyPatientNumber: z.number().int().min(1).optional(),
  opdNo: z.string().min(1).optional(),
  sdId: z.string().min(1).optional(),
  patientDob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  patientAge: z.number().int().min(0).max(130).optional(),
  patientGender: PatientGender.optional(),
  isOffline: z.boolean().optional(),
});

export type TokenPrintPayload = z.infer<typeof TokenPrintPayload>;
