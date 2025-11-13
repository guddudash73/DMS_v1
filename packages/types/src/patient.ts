import { z } from 'zod';

export const PatientId = z.string().min(1);
export type PatientId = z.infer<typeof PatientId>;

export const Patient = z.object({
  patientId: PatientId,
  name: z.string().min(1),
  phone: z.string().min(7).max(20).optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Patient = z.infer<typeof Patient>;

export const PatientCreate = z.object({
  name: z.string().min(1),
  phone: z.string().min(7).max(20).optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});
export type PatientCreate = z.infer<typeof PatientCreate>;

export const PatientUpdate = PatientCreate.partial().refine((val) => Object.keys(val).length > 0, {
  message: 'At least one field must be provided for update.',
});
export type PatientUpdate = z.infer<typeof PatientUpdate>;

export const PatientSearchQuery = z.object({
  query: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type PatientSearchQuery = z.infer<typeof PatientSearchQuery>;
