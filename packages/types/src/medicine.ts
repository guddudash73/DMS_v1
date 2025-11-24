import { z } from 'zod';

export const MedicinePresetId = z.string().min(1);
export type MedicinePresetId = z.infer<typeof MedicinePresetId>;

export const NormalizedMedicineName = z.string().min(1);

export const MedicineSource = z.enum(['ADMIN_IMPORT', 'INLINE_DOCTOR']);
export type MedicineSource = z.infer<typeof MedicineSource>;

export const MedicineForm = z.enum([
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'OINTMENT',
  'GEL',
  'MOUTHWASH',
  'OTHER',
]);
export type MedicineForm = z.infer<typeof MedicineForm>;

export const MedicinePreset = z.object({
  id: MedicinePresetId,
  displayName: z.string().min(1),
  normalizedName: NormalizedMedicineName,
  defaultDose: z.string().min(1).optional(),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),
  form: MedicineForm.optional(),
  tags: z.array(z.string().min(1)).optional(),
  createdAt: z.number().int().nonnegative(),
  createdByUserId: z.string().min(1),
  source: MedicineSource,
  verified: z.boolean(),
});
export type MedicinePreset = z.infer<typeof MedicinePreset>;

export const MedicineSearchQuery = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type MedicineSearchQuery = z.infer<typeof MedicineSearchQuery>;

export const QuickAddMedicineInput = z.object({
  displayName: z.string().min(1),
  defaultDose: z.string().min(1).optional(),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),
  form: MedicineForm.optional(),
});
export type QuickAddMedicineInput = z.infer<typeof QuickAddMedicineInput>;

export const MedicineTypeaheadItem = z.object({
  id: MedicinePresetId,
  displayName: z.string().min(1),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),
  form: MedicineForm.optional(),
});
export type MedicineTypeaheadItem = z.infer<typeof MedicineTypeaheadItem>;
