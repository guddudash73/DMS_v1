// packages/types/src/prescription.ts
import { z } from 'zod';
import { VisitId } from './visit';
import { MedicineType } from './medicine'; // ✅ add this import

const Frequency = z.enum(['QD', 'BID', 'TID', 'QID', 'HS', 'PRN']);
const Timing = z.enum(['BEFORE_MEAL', 'AFTER_MEAL', 'ANY']);

export const ToothPosition = z.enum(['UL', 'UR', 'LL', 'LR']);
export type ToothPosition = z.infer<typeof ToothPosition>;

export const ToothNumber = z.string().max(20);
export type ToothNumber = z.infer<typeof ToothNumber>;

export const ToothDetail = z.object({
  blockId: z.string().min(1).max(64).optional(),
  position: ToothPosition.optional(),
  toothNumbers: z.array(ToothNumber).max(8).optional(),
  notes: z.string().max(500).optional(),
  diagnosis: z.string().max(500).optional(),
  advice: z.string().max(500).optional(),
  procedure: z.string().max(500).optional(),
});
export type ToothDetail = z.infer<typeof ToothDetail>;

// ✅ Only medicine required; everything else optional
export const RxLine = z.object({
  medicine: z.string().min(1),

  // ✅ new: store medicineType with each line
  medicineType: MedicineType.optional(),

  dose: z.string().min(1).optional(),
  amountPerDose: z.string().min(1).max(64).optional(),
  frequency: Frequency.optional(),
  duration: z.number().int().min(1).max(365).optional(),
  sig: z.string().max(500).optional(),
  timing: Timing.optional(),
  notes: z.string().max(500).optional(),
});

export const RxId = z.string().min(1);
export type RxId = z.infer<typeof RxId>;

export const Prescription = z.object({
  rxId: RxId,
  visitId: VisitId,
  lines: z.array(RxLine).default([]),
  version: z.number().int().min(1).default(1),
  jsonKey: z.string().min(1),
  toothDetails: z.array(ToothDetail).optional(),
  doctorNotes: z.string().max(2000).optional(),
  doctorReceptionNotes: z.string().max(2000).optional(),
  receptionNotes: z.string().max(2000).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Prescription = z.infer<typeof Prescription>;
export type RxLineType = z.infer<typeof RxLine>;
