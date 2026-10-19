import { z } from 'zod';

export const createEstablishmentSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  type: z.enum(['BAR', 'RESTAURANT', 'HOTEL', 'GROSSISTE', 'EPICERIE']),
  address: z.string().optional(),
  // Facultatifs ; null (ou vide) efface la valeur
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().toLowerCase().email('Email invalide').max(120).nullable().optional().or(z.literal('')),
  postalBox: z.string().trim().max(60).nullable().optional(),
  nif: z.string().trim().max(40).nullable().optional(),
  rc: z.string().trim().max(60).nullable().optional(),
  logo: z.string().url('URL invalide').optional().or(z.literal('')),
});

export const updateEstablishmentSchema = createEstablishmentSchema.partial();

export type CreateEstablishmentInput = z.infer<typeof createEstablishmentSchema>;
export type UpdateEstablishmentInput = z.infer<typeof updateEstablishmentSchema>;
