import { z } from 'zod';

export const PatientId = z.string().min(1);
export type PatientId = z.infer<typeof PatientId>;

export const PatientGender = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']);
export type PatientGender = z.infer<typeof PatientGender>;

const PatientGenderInput = z.preprocess((val) => {
  if (typeof val !== 'string') return val;
  const v = val.trim();
  const upper = v.toUpperCase();

  if (upper === 'MALE' || upper === 'FEMALE' || upper === 'OTHER' || upper === 'UNKNOWN') {
    return upper;
  }

  if (v === 'male') return 'MALE';
  if (v === 'female') return 'FEMALE';
  if (v === 'other') return 'OTHER';

  return val;
}, PatientGender);

export const Patient = z.object({
  patientId: PatientId,
  sdId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(5).max(13),
  dob: z.string().optional(),
  gender: PatientGender.optional(),
  address: z.string().min(1).max(500).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  isDeleted: z.boolean().default(false),
  deletedAt: z.number().int().nonnegative().optional(),
  isAvoided: z.boolean().optional().default(false),
  avoidedAt: z.number().int().nonnegative().optional(),
  unavoidedAt: z.number().int().nonnegative().optional(),
});
export type Patient = z.infer<typeof Patient>;

export const PatientCreate = z.object({
  name: z.string().min(1),
  phone: z.string().min(7).max(20),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),

  gender: PatientGenderInput.optional(),

  address: z.string().min(1).max(500).optional(),
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
