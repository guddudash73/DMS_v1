// packages/types/src/patientSummary.ts
import { z } from 'zod';

export const PatientSummary = z.object({
  doneVisitCount: z.number().int().min(0),
  lastVisitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  nextFollowUpDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export type PatientSummary = z.infer<typeof PatientSummary>;
