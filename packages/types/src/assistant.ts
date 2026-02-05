import { z } from 'zod';

export const AssistantId = z.string().min(1);
export type AssistantId = z.infer<typeof AssistantId>;

export const Assistant = z.object({
  assistantId: AssistantId,
  name: z.string().min(1).max(64),
  active: z.boolean(),

  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Assistant = z.infer<typeof Assistant>;

export const AssistantCreate = z.object({
  name: z.string().min(1).max(64),
  active: z.boolean().optional(),
});
export type AssistantCreate = z.infer<typeof AssistantCreate>;

export const AssistantUpdate = z.object({
  name: z.string().min(1).max(64).optional(),
  active: z.boolean().optional(),
});
export type AssistantUpdate = z.infer<typeof AssistantUpdate>;

export const AssistantsListResponse = z.object({
  items: z.array(Assistant),
});
export type AssistantsListResponse = z.infer<typeof AssistantsListResponse>;
