// packages/types/src/prescription.ts
import { z } from 'zod';
import { VisitId } from './visit';

const Frequency = z.enum(['QD', 'BID', 'TID', 'QID', 'HS', 'PRN']);
const Timing = z.enum(['BEFORE_MEAL', 'AFTER_MEAL', 'ANY']);

export const RxLine = z.object({
  medicine: z.string().min(1),
  dose: z.string().min(1),
  frequency: Frequency,
  duration: z.number().int().min(1).max(365),
  sig: z.string().max(500).optional(),
  timing: Timing.optional(),
  notes: z.string().max(500).optional(),
});

export const RxId = z.string().min(1);
export type RxId = z.infer<typeof RxId>;

export const Prescription = z.object({
  rxId: RxId,
  visitId: VisitId,
  doctorId: z.string().min(1),
  lines: z.array(RxLine).min(1),
  version: z.number().int().min(1).default(1),
  jsonKey: z.string().min(1),

  // ✅ NEW: reception notes (prints + shows on preview)
  receptionNotes: z.string().max(2000).optional(),

  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Prescription = z.infer<typeof Prescription>;
export type RxLineType = z.infer<typeof RxLine>;
