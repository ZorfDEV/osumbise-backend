import { z } from 'zod';

export const createCashRegisterSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'), // ex. "Caisse #01"
  establishmentId: z.string().uuid().optional(),
});

export type CreateCashRegisterInput = z.infer<typeof createCashRegisterSchema>;
