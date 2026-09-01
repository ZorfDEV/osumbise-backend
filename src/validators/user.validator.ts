import { z } from 'zod';

// OWNER exclu volontairement : un propriétaire n'est créé qu'à l'inscription
// (un par organisation), jamais via cet endpoint de gestion d'équipe
const ASSIGNABLE_ROLES = ['ADMIN', 'CASHIER', 'SERVER', 'STOCK_KEEPER', 'COOK'] as const;

export const createUserSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  role: z.enum(ASSIGNABLE_ROLES),
  // Optionnel : uniquement nécessaire quand le créateur est OWNER (pas
  // d'établissement fixe, donc obligé de préciser lequel est visé)
  establishmentId: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  establishmentId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
