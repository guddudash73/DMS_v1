import { z } from 'zod';
import { Visit } from './visit';
import { TokenPrintPayload } from './print';

export const VisitCreateResponse = z.object({
  visit: Visit,
  tokenPrint: TokenPrintPayload,
});

export type VisitCreateResponse = z.infer<typeof VisitCreateResponse>;
