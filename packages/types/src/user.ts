import { z } from 'zod';

export const Role = z.enum(['RECEPTION', 'DOCTOR', 'ADMIN']);
export type Role = z.infer<typeof Role>;

export const UserId = z.string().min(1);
export type UserId = z.infer<typeof UserId>;

export const User = z.object({
  userId: UserId,
  email: z.email(), // ✅ This is correct!
  displayName: z.string().min(1),
  role: Role,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type User = z.infer<typeof User>;
