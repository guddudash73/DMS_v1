// packages/types/src/patient.ts
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

const PatientDob = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PatientAge = z.coerce.number().int().min(0).max(130);

export const Patient = z.object({
  patientId: PatientId,
  sdId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(5).max(13),

  // ✅ exactly one stored, but Patient record can have either depending on history
  dob: PatientDob.optional(),
  age: PatientAge.optional(),

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

export const PatientCreate = z
  .object({
    name: z.string().min(1),
    phone: z.string().min(7).max(20),

    dob: PatientDob.optional(),
    age: PatientAge.optional(),

    gender: PatientGenderInput.optional(),
    address: z.string().min(1).max(500).optional(),
  })
  .superRefine((val, ctx) => {
    const hasDob = typeof val.dob === 'string' && val.dob.trim().length > 0;
    const hasAge = typeof val.age === 'number' && Number.isFinite(val.age);

    if (hasDob && hasAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['dob'],
        message: 'Provide either DOB or Age, not both.',
      });
      ctx.addIssue({
        code: 'custom',
        path: ['age'],
        message: 'Provide either DOB or Age, not both.',
      });
      return;
    }

    if (!hasDob && !hasAge) {
      ctx.addIssue({
        code: 'custom',
        path: ['dob'],
        message: 'DOB or Age is required.',
      });
      ctx.addIssue({
        code: 'custom',
        path: ['age'],
        message: 'DOB or Age is required.',
      });
    }
  });
export type PatientCreate = z.infer<typeof PatientCreate>;

export const PatientUpdate = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().min(7).max(20).optional(),

    dob: PatientDob.optional(),
    age: PatientAge.optional(),

    gender: PatientGenderInput.optional(),
    address: z.string().min(1).max(500).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided for update.',
  })
  .superRefine((val, ctx) => {
    const hasDob = typeof val.dob === 'string' && val.dob.trim().length > 0;
    const hasAge = typeof val.age === 'number' && Number.isFinite(val.age);

    if (hasDob && hasAge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dob'],
        message: 'Provide either DOB or Age, not both.',
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['age'],
        message: 'Provide either DOB or Age, not both.',
      });
    }
  });
export type PatientUpdate = z.infer<typeof PatientUpdate>;

export const PatientSearchQuery = z.object({
  query: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type PatientSearchQuery = z.infer<typeof PatientSearchQuery>;
