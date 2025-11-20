import { z } from 'zod';
import { VisitId } from './visit.js';
import { UserId } from './user.js';

export const XrayId = z.string().min(1);
export type XrayId = z.infer<typeof XrayId>;

export const XrayContentType = z.enum(['image/jpeg', 'image/png']);
export type XrayContentType = z.infer<typeof XrayContentType>;

export const Xray = z.object({
  xrayId: XrayId,
  visitId: VisitId,
  contentKey: z.string().min(1),
  thumbKey: z.string().min(1).optional(),

  contentType: XrayContentType,
  size: z.number().int().nonnegative(),

  takenAt: z.number().int().nonnegative(),
  takenByUserId: UserId,

  createdAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().optional(),
});

export type Xray = z.infer<typeof Xray>;
