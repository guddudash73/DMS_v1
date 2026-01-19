import { z } from 'zod';
import { RxLine } from './prescription';
import type { RxLineType } from './prescription';

export const PrescriptionPresetId = z.string().min(1);
export type PrescriptionPresetId = z.infer<typeof PrescriptionPresetId>;

export const PrescriptionPresetScope = z.enum(['PRIVATE', 'PUBLIC', 'ADMIN']);
export type PrescriptionPresetScope = z.infer<typeof PrescriptionPresetScope>;

export const PrescriptionPreset = z.object({
  id: PrescriptionPresetId,
  name: z.string().min(1),
  lines: z.array(RxLine).min(1),
  tags: z.array(z.string().min(1)).optional(),
  scope: PrescriptionPresetScope.default('PRIVATE'),
  createdByUserId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative().optional(),
});

export type PrescriptionPreset = z.infer<typeof PrescriptionPreset>;

export const RxPresetFilter = z.enum(['ALL', 'MINE', 'ADMIN', 'PUBLIC']);
export type RxPresetFilter = z.infer<typeof RxPresetFilter>;

export const PrescriptionPresetSearchQuery = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  filter: RxPresetFilter.optional(),
});
export type PrescriptionPresetSearchQuery = z.infer<typeof PrescriptionPresetSearchQuery>;

export const CreateRxPresetRequest = z.object({
  name: z.string().min(1),
  lines: z.array(RxLine).min(1),
  tags: z.array(z.string().min(1)).optional(),
  scope: PrescriptionPresetScope.optional(),
});
export type CreateRxPresetRequest = z.infer<typeof CreateRxPresetRequest>;

export const UpdateRxPresetRequest = z.object({
  name: z.string().min(1).optional(),
  lines: z.array(RxLine).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  scope: PrescriptionPresetScope.optional(),
});
export type UpdateRxPresetRequest = z.infer<typeof UpdateRxPresetRequest>;

export const AdminCreateRxPresetRequest = z.object({
  name: z.string().min(1),
  lines: z.array(RxLine).min(1),
  tags: z.array(z.string().min(1)).optional(),
});
export type AdminCreateRxPresetRequest = z.infer<typeof AdminCreateRxPresetRequest>;

export const AdminUpdateRxPresetRequest = z.object({
  name: z.string().min(1).optional(),
  lines: z.array(RxLine).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
});
export type AdminUpdateRxPresetRequest = z.infer<typeof AdminUpdateRxPresetRequest>;

export type AdminRxPresetLine = RxLineType;

export const AdminRxPresetSearchQuery = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type AdminRxPresetSearchQuery = z.infer<typeof AdminRxPresetSearchQuery>;

export const AdminRxPresetListResponse = z.object({
  items: z.array(PrescriptionPreset),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type AdminRxPresetListResponse = z.infer<typeof AdminRxPresetListResponse>;
