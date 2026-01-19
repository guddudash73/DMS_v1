import { z } from 'zod';
import { VisitId } from './visit';

const Frequency = z.enum(['QD', 'BID', 'TID', 'QID', 'HS', 'PRN']);
const Timing = z.enum(['BEFORE_MEAL', 'AFTER_MEAL', 'ANY']);

export const ToothPosition = z.enum(['UL', 'UR', 'LL', 'LR']);
export type ToothPosition = z.infer<typeof ToothPosition>;

export const ToothNumber = z.string().min(1).max(20);
export type ToothNumber = z.infer<typeof ToothNumber>;

export const ToothDetail = z.object({
  position: ToothPosition,
  toothNumbers: z.array(ToothNumber).min(1).max(8),
  notes: z.string().max(500).optional(),
});
export type ToothDetail = z.infer<typeof ToothDetail>;

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
  lines: z.array(RxLine).default([]),
  version: z.number().int().min(1).default(1),
  jsonKey: z.string().min(1),
  toothDetails: z.array(ToothDetail).optional(),
  doctorNotes: z.string().max(2000).optional(),
  receptionNotes: z.string().max(2000).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Prescription = z.infer<typeof Prescription>;
export type RxLineType = z.infer<typeof RxLine>;
