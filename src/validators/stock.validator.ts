import { z } from 'zod';

export const entrySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.string().optional(),
});

export const lossSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  type: z.enum(['PERTE', 'CASSE']).optional().default('PERTE'),
  reason: z.string().optional(),
});

export const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  countedQuantity: z.number().nonnegative(),
  reason: z.string().optional(),
});

export type EntryInput = z.infer<typeof entrySchema>;
export type LossInput = z.infer<typeof lossSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
