import { z } from 'zod';

export const Role = z.enum(['RECEPTION', 'DOCTOR', 'ADMIN']);
export type Role = z.infer<typeof Role>;

export const UserId = z.string().min(1);
export type UserId = z.infer<typeof UserId>;

export const User = z.object({
  userId: UserId,
  email: z.email(),
  displayName: z.string().min(1),
  role: Role,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type User = z.infer<typeof User>;

export const DoctorId = UserId;
export type DoctorId = z.infer<typeof DoctorId>;

export const DoctorProfile = z.object({
  doctorId: DoctorId,
  fullName: z.string().min(1),
  registrationNumber: z.string().min(1),
  specialization: z.string().min(1),
  contact: z.string().min(5).max(64).optional(),
  active: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type DoctorProfile = z.infer<typeof DoctorProfile>;

export const AdminCreateDoctorRequest = z.object({
  email: z.email(),
  displayName: z.string().min(1),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1),
  registrationNumber: z.string().min(1),
  specialization: z.string().min(1),
  contact: z.string().min(5).max(64).optional(),
});
export type AdminCreateDoctorRequest = z.infer<typeof AdminCreateDoctorRequest>;

export const AdminUpdateDoctorRequest = z.object({
  fullName: z.string().min(1).optional(),
  registrationNumber: z.string().min(1).optional(),
  specialization: z.string().min(1).optional(),
  contact: z.string().min(5).max(64).optional(),
  active: z.boolean().optional(),
});
export type AdminUpdateDoctorRequest = z.infer<typeof AdminUpdateDoctorRequest>;

export const AdminDoctorListItem = DoctorProfile.extend({
  email: z.email(),
  displayName: z.string().min(1),
});
export type AdminDoctorListItem = z.infer<typeof AdminDoctorListItem>;

export const DashboardPreferences = z.object({
  selectedDoctorIds: z.array(DoctorId).max(3),
});
export type DashboardPreferences = z.infer<typeof DashboardPreferences>;

export const UserPreferences = z.object({
  dashboard: DashboardPreferences.optional(),
});
export type UserPreferences = z.infer<typeof UserPreferences>;
