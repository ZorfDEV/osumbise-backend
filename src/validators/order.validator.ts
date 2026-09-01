import { z } from 'zod';

export const createOrderSchema = z.object({
  tableId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  establishmentId: z.string().uuid().optional(),
});

export const addOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
});

export const updateOrderItemSchema = z.object({
  quantity: z.number().int().positive(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'BROUILLON',
    'EN_ATTENTE',
    'EN_PREPARATION',
    'PRETE',
    'SERVIE',
    'PAYEE',
    'FERMEE',
    'ANNULEE',
  ]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;
export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
