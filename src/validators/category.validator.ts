import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  // Optionnel : uniquement nécessaire quand l'utilisateur connecté est OWNER
  // (pas d'établissement fixe, donc obligé de préciser lequel est visé)
  establishmentId: z.string().uuid().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
