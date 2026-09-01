import { z } from 'zod';

export const createRecipeItemSchema = z.object({
  ingredientProductId: z.string().uuid(),
  quantity: z.number().positive(),
});

export const updateRecipeItemSchema = z.object({
  quantity: z.number().positive(),
});

export type CreateRecipeItemInput = z.infer<typeof createRecipeItemSchema>;
export type UpdateRecipeItemInput = z.infer<typeof updateRecipeItemSchema>;
