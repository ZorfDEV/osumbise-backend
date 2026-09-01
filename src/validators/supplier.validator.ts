import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(2, 'Le nom est requis'),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional(),
  address: z.string().optional(),
  establishmentId: z.string().uuid().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
