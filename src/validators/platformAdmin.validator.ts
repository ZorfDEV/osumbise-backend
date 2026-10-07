import { z } from 'zod';

export const updateSubscriptionAdminSchema = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']).optional(),
  planId: z.string().uuid().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
});

export const updateOwnerStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateSubscriptionAdminInput = z.infer<typeof updateSubscriptionAdminSchema>;
export type UpdateOwnerStatusInput = z.infer<typeof updateOwnerStatusSchema>;
