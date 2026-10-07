import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Le nom est requis'),
  phone: z.string().optional(),
  address: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  establishmentId: z.string().uuid().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const recordCustomerPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'TRANSFER', 'CREDIT']),
  note: z.string().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type RecordCustomerPaymentInput = z.infer<typeof recordCustomerPaymentSchema>;
