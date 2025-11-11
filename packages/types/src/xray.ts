import { z } from 'zod';
import { VisitId } from './visit.js';

export const XrayId = z.string().min(1);
export type XrayId = z.infer<typeof XrayId>;

export const Xray = z.object({
  xrayId: XrayId,
  visitId: VisitId,
  contentKey: z.string().min(1),
  thumbKey: z.string().optional(),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});

export type Xray = z.infer<typeof Xray>;
