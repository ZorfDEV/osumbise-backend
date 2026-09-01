import { z } from 'zod';

export const createTableSchema = z.object({
  label: z.string().min(1, 'Le libellé est requis'),
  zone: z.string().optional(),
  establishmentId: z.string().uuid().optional(),
});

export const updateTableStatusSchema = z.object({
  status: z.enum(['FREE', 'OCCUPIED', 'PENDING_ORDER', 'BILL_REQUESTED']),
});

export const updateTableSchema = z.object({
  label: z.string().min(1).optional(),
  zone: z.string().optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
