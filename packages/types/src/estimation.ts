import { z } from 'zod';
import { PatientId } from './patient';
import { UserId } from './user';

export const EstimationId = z.string().min(1);
export type EstimationId = z.infer<typeof EstimationId>;

export const EstimationNo = z.string().min(1);
export type EstimationNo = z.infer<typeof EstimationNo>;

export const EstimationLine = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().int().min(1),
  amount: z.number().nonnegative(),
});
export type EstimationLine = z.infer<typeof EstimationLine>;

export const EstimationCreateRequest = z.object({
  items: z.array(EstimationLine).min(1),
  notes: z.string().max(1000).optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type EstimationCreateRequest = z.infer<typeof EstimationCreateRequest>;

export const Estimation = z.object({
  estimationId: EstimationId,
  estimationNo: EstimationNo,

  patientId: PatientId,

  items: z.array(EstimationLine),
  total: z.number().nonnegative(),

  currency: z.string().min(1).max(16).default('INR'),

  notes: z.string().max(1000).optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),

  createdByUserId: UserId,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Estimation = z.infer<typeof Estimation>;

export const PatientEstimationsListResponse = z.object({
  items: z.array(Estimation),
  nextCursor: z.string().nullable(),
});
export type PatientEstimationsListResponse = z.infer<typeof PatientEstimationsListResponse>;
