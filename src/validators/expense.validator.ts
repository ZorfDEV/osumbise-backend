import { z } from 'zod';

export const createExpenseCategorySchema = z.object({
  name: z.string().min(2, 'Le nom est requis'),
  establishmentId: z.string().uuid().optional(),
});

export const createExpenseSchema = z.object({
  expenseCategoryId: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().optional(),
  establishmentId: z.string().uuid().optional(),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
