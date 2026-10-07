import { z } from 'zod';

const productFields = z.object({
  categoryId: z.string().uuid('categoryId invalide'),
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  sku: z.string().optional(),
  sellingPrice: z.number().nonnegative(),
  cost: z.number().nonnegative().optional().default(0),
  tva: z.number().min(0).max(100).optional().default(0),
  unit: z.enum(['UNIT', 'G', 'KG', 'ML', 'CL', 'L']).optional().default('UNIT'),
  stockMin: z.number().nonnegative().optional().default(0),
  image: z.string().url().optional(),
  // Remise en pourcentage (0-100) appliquée sur sellingPrice, facultative.
  // null efface une remise existante ; sans tagStartsAt/tagEndsAt elle
  // s'applique tant que tag est renseigné
  tag: z.number().min(0).max(100).nullable().optional(),
  tagStartsAt: z.coerce.date().nullable().optional(),
  tagEndsAt: z.coerce.date().nullable().optional(),
  type: z.enum(['VEGETARIEN', 'SANS_SUCRE', 'ALCOOLISE', 'MUSULMAN']).optional(),
  // Optionnel : uniquement nécessaire quand l'utilisateur connecté est OWNER
  establishmentId: z.string().uuid().optional(),
});

const validateTagPeriod = (data: { tagStartsAt?: Date | null; tagEndsAt?: Date | null }) =>
  !data.tagStartsAt || !data.tagEndsAt || data.tagStartsAt <= data.tagEndsAt;

const tagPeriodIssue: { message: string; path: (string | number)[] } = {
  message: 'La date de fin de remise doit être postérieure à la date de début',
  path: ['tagEndsAt'],
};

export const createProductSchema = productFields.refine(validateTagPeriod, tagPeriodIssue);

export const updateProductSchema = productFields
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(validateTagPeriod, tagPeriodIssue);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
