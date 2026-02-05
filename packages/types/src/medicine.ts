import { z } from 'zod';

export const MedicinePresetId = z.string().min(1);
export type MedicinePresetId = z.infer<typeof MedicinePresetId>;

export const NormalizedMedicineName = z.string().min(1);

export const MedicineSource = z.enum(['ADMIN_IMPORT', 'INLINE_DOCTOR']);
export type MedicineSource = z.infer<typeof MedicineSource>;

/**
 * ✅ Medicine type:
 * - Allows dropdown usage in UI (known list)
 * - Also allows manual entry if not listed
 */
export const MedicineType = z.string().min(1).max(64);
export type MedicineType = z.infer<typeof MedicineType>;

export const MedicinePreset = z.object({
  id: MedicinePresetId,
  displayName: z.string().min(1),
  normalizedName: NormalizedMedicineName,

  // defaults used to populate Rx editor on selection
  defaultDose: z.string().min(1).optional(),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),

  // ✅ new
  medicineType: MedicineType.optional(),

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

  // ✅ new
  medicineType: MedicineType.optional(),
});
export type QuickAddMedicineInput = z.infer<typeof QuickAddMedicineInput>;

/**
 * ✅ Typeahead item MUST include defaults so UI can populate on selection.
 */
export const MedicineTypeaheadItem = z.object({
  id: MedicinePresetId,
  displayName: z.string().min(1),
  defaultDose: z.string().min(1).optional(),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),

  // ✅ new
  medicineType: MedicineType.optional(),
});
export type MedicineTypeaheadItem = z.infer<typeof MedicineTypeaheadItem>;

export const MedicineCatalogSearchQuery = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type MedicineCatalogSearchQuery = z.infer<typeof MedicineCatalogSearchQuery>;

export const MedicineCatalogListResponse = z.object({
  items: z.array(MedicinePreset),
  nextCursor: z.string().nullable(),
});
export type MedicineCatalogListResponse = z.infer<typeof MedicineCatalogListResponse>;

export const DoctorUpdateMedicineRequest = z.object({
  displayName: z.string().min(1).optional(),
  defaultDose: z.string().min(1).optional(),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),

  // ✅ new
  medicineType: MedicineType.optional(),
});
export type DoctorUpdateMedicineRequest = z.infer<typeof DoctorUpdateMedicineRequest>;

export const AdminMedicinesStatus = z.enum(['PENDING', 'VERIFIED']);
export type AdminMedicinesStatus = z.infer<typeof AdminMedicinesStatus>;

export const AdminMedicineSearchQuery = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: AdminMedicinesStatus.optional(),
});
export type AdminMedicineSearchQuery = z.infer<typeof AdminMedicineSearchQuery>;

export const AdminMedicineListResponse = z.object({
  items: z.array(MedicinePreset),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type AdminMedicineListResponse = z.infer<typeof AdminMedicineListResponse>;

export const AdminUpdateMedicineRequest = z.object({
  displayName: z.string().min(1).optional(),
  defaultDose: z.string().min(1).optional(),
  defaultFrequency: z.string().min(1).optional(),
  defaultDuration: z.number().int().min(1).max(365).optional(),

  // ✅ new
  medicineType: MedicineType.optional(),

  tags: z.array(z.string().min(1)).optional(),
  verified: z.boolean().optional(),
});
export type AdminUpdateMedicineRequest = z.infer<typeof AdminUpdateMedicineRequest>;
