import { z } from 'zod';

export const payOrderSchema = z.object({
  // Optionnel : sans session de caisse précisée, le paiement est enregistré
  // mais aucun mouvement de caisse n'est créé (utile pour virement/crédit,
  // qui ne touchent physiquement aucun tiroir de toute façon)
  cashSessionId: z.string().uuid().optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'TRANSFER', 'CREDIT']),
        amount: z.number().positive(),
      })
    )
    .min(1, 'Au moins un paiement est requis'),
});

export type PayOrderInput = z.infer<typeof payOrderSchema>;
