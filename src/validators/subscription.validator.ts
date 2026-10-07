import { z } from 'zod';

export const selectPlanSchema = z.object({
  planId: z.string().uuid('Choisis une formule'),
});

export type SelectPlanInput = z.infer<typeof selectPlanSchema>;
