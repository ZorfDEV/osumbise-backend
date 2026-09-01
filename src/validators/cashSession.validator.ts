import { z } from 'zod';

export const openCashSessionSchema = z.object({
  openingBalance: z.number().nonnegative(),
});

export const closeCashSessionSchema = z.object({
  actualBalance: z.number().nonnegative(),
});

// SALE_CASH / SALE_CARD / SALE_MOBILE_MONEY sont générés automatiquement par
// le paiement d'une commande — jamais saisis manuellement ici
export const createCashMovementSchema = z.object({
  type: z.enum(['EXPENSE', 'REFUND', 'ADJUSTMENT']),
  amount: z.number(),
  note: z.string().optional(),
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;
