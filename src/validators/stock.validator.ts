import { z } from 'zod';

const location = z.enum(['SALES', 'RESERVE']);

export const entrySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  // Réserve par défaut (livraison), ou directement en vente
  location: location.optional(),
  reason: z.string().optional(),
});

export const lossSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  type: z.enum(['PERTE', 'CASSE']).optional().default('PERTE'),
  location: location.optional(),
  reason: z.string().optional(),
});

export const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  countedQuantity: z.number().nonnegative(),
  location: location.optional(),
  // Justification obligatoire : modifier un stock doit toujours être expliqué
  reason: z.string().trim().min(3, 'Indiquez la justification'),
});

// Déstockage réserve → vente (ou retour)
export const transferSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  direction: z.enum(['TO_SALES', 'TO_RESERVE']).default('TO_SALES'),
  reason: z.string().optional(),
});

// Correction d'une entrée : nouvelle quantité + justification obligatoire
export const correctionSchema = z.object({
  quantity: z.number().nonnegative(),
  reason: z.string().trim().min(3, 'Indiquez la justification'),
});

export type TransferInput = z.infer<typeof transferSchema>;
export type CorrectionInput = z.infer<typeof correctionSchema>;

export type EntryInput = z.infer<typeof entrySchema>;
export type LossInput = z.infer<typeof lossSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
