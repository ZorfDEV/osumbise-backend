import { z } from 'zod';

export const createProductSchema = z.object({
  categoryId: z.string().uuid('categoryId invalide'),
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  sku: z.string().optional(),
  sellingPrice: z.number().nonnegative(),
  cost: z.number().nonnegative().optional().default(0),
  tva: z.number().min(0).max(100).optional().default(0),
  unit: z.enum(['UNIT', 'G', 'KG', 'ML', 'CL', 'L']).optional().default('UNIT'),
  stockMin: z.number().nonnegative().optional().default(0),
  image: z.string().url().optional(),
  // Optionnel : uniquement nécessaire quand l'utilisateur connecté est OWNER
  establishmentId: z.string().uuid().optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
