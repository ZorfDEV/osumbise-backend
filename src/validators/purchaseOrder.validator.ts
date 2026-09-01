import { z } from 'zod';

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  establishmentId: z.string().uuid().optional(),
});

export const addPurchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

export const updatePurchaseItemSchema = z.object({
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
});

// RECU volontairement absent : passe uniquement par /receive (effets de bord
// sur le stock, voir purchaseOrder.service.ts)
export const updatePurchaseOrderStatusSchema = z.object({
  status: z.enum(['BROUILLON', 'COMMANDE', 'ANNULE']),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type AddPurchaseItemInput = z.infer<typeof addPurchaseItemSchema>;
export type UpdatePurchaseItemInput = z.infer<typeof updatePurchaseItemSchema>;
export type UpdatePurchaseOrderStatusInput = z.infer<typeof updatePurchaseOrderStatusSchema>;
