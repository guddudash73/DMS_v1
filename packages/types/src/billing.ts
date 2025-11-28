import { z } from 'zod';
import { FollowUpContactMethod, VisitId } from './visit';

export const BillingLine = z.object({
  code: z.string().min(1).max(64).optional(),
  description: z.string().min(1).max(200),
  quantity: z.number().int().min(1),
  unitAmount: z.number().nonnegative(),
});

export type BillingLine = z.infer<typeof BillingLine>;

export const CheckoutFollowUpInput = z.object({
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500).optional(),
  contactMethod: FollowUpContactMethod.optional(),
});

export type CheckoutFollowUpInput = z.infer<typeof CheckoutFollowUpInput>;

export const BillingCheckoutInput = z.object({
  items: z.array(BillingLine).min(1),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  followUp: CheckoutFollowUpInput.optional(),
});

export type BillingCheckoutInput = z.infer<typeof BillingCheckoutInput>;

export const Billing = z.object({
  visitId: VisitId,
  items: z.array(
    BillingLine.extend({
      lineTotal: z.number().nonnegative(),
    }),
  ),
  subtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
  currency: z.string().min(1).max(16).default('INR'),
  createdAt: z.number().int().nonnegative(),
});

export type Billing = z.infer<typeof Billing>;
