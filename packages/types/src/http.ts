import { z } from 'zod';

export const errorResponseSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string().min(1))).optional(),
  traceId: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
