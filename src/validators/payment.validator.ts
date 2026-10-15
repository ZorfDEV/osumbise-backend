import { z } from 'zod';

export const payOrderSchema = z.object({
  // Optionnel : sans session de caisse précisée, le paiement est enregistré
  // mais aucun mouvement de caisse n'est créé (utile pour virement/crédit,
  // qui ne touchent physiquement aucun tiroir de toute façon)
  cashSessionId: z.string().uuid().optional(),
  // Hôtel : séjour en cours auquel imputer la part payée "sur la chambre" (ROOM)
  stayId: z.string().uuid().optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'TRANSFER', 'CREDIT', 'ROOM']),
        amount: z.number().positive(),
      })
    )
    .min(1, 'Au moins un paiement est requis'),
})
  .refine((d) => !d.payments.some((p) => p.method === 'ROOM') || !!d.stayId, {
    message: 'Choisissez la chambre (séjour en cours) à laquelle imputer la consommation',
    path: ['stayId'],
  });

export type PayOrderInput = z.infer<typeof payOrderSchema>;
