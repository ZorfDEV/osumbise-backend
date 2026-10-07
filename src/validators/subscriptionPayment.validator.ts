import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  phone: z.string().min(8, 'Numéro invalide'),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
