import { z } from 'zod';

export const createCashRegisterSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'), // ex. "Caisse #01"
  establishmentId: z.string().uuid().optional(),
});

// Verrouiller / déverrouiller une caisse (propriétaire)
export const lockCashRegisterSchema = z.object({
  locked: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

export type LockCashRegisterInput = z.infer<typeof lockCashRegisterSchema>;
export type CreateCashRegisterInput = z.infer<typeof createCashRegisterSchema>;
