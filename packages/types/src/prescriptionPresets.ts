import { z } from 'zod';
import { RxLine } from './prescription';

export const PrescriptionPresetId = z.string().min(1);
export type PrescriptionPresetId = z.infer<typeof PrescriptionPresetId>;

export const PrescriptionPreset = z.object({
  id: PrescriptionPresetId,
  name: z.string().min(1),
  lines: z.array(RxLine).min(1),
  tags: z.array(z.string().min(1)).optional(),
  createdByUserId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});

export type PrescriptionPreset = z.infer<typeof PrescriptionPreset>;

export const PrescriptionPresetSearchQuery = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type PrescriptionPresetSearchQuery = z.infer<typeof PrescriptionPresetSearchQuery>;
