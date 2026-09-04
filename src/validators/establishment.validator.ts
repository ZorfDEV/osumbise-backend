import { z } from 'zod';

export const createEstablishmentSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  type: z.enum(['BAR', 'RESTAURANT', 'HOTEL']),
  address: z.string().optional(),
  logo: z.string().url('URL invalide').optional().or(z.literal('')),
});

export const updateEstablishmentSchema = createEstablishmentSchema.partial();

export type CreateEstablishmentInput = z.infer<typeof createEstablishmentSchema>;
export type UpdateEstablishmentInput = z.infer<typeof updateEstablishmentSchema>;
