import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { CreateUserInput, UpdateUserInput, ResetPasswordInput } from '../validators/user.validator';
import { checkUserLimit } from '../utils/planLimits';

export const listUsers = async (req: Request, res: Response) => {
  const users = await req.db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      establishmentId: true,
      isActive: true,
      createdAt: true,
      establishment: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  res.status(200).json({ users });
};

export const createUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body as CreateUserInput;
  // Même logique que pour les catégories/produits/tables : automatique si le
  // créateur est assigné à un établissement fixe, explicite (et vérifié) si
  // c'est un OWNER multi-établissements
  const establishmentId = await resolveEstablishmentId(req);

  const limitError = await checkUserLimit(req.user!.organizationId);
  if (limitError) {
    return res.status(403).json({ message: limitError });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: 'Cet email est déjà utilisé' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Pas d'invitation par email dans ce MVP : le créateur fixe un mot de passe
  // initial, à communiquer directement à l'employé
  const user = await prisma.user.create({
    data: {
      organizationId: req.user!.organizationId,
      establishmentId,
      name,
      email,
      passwordHash,
      role,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      establishmentId: true,
      isActive: true,
    },
  });

  res.status(201).json({ user });
};

export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateUserInput;

  if (id === req.user!.id) {
    return res.status(400).json({ message: 'Impossible de modifier son propre compte ici' });
  }

  const existing = await assertInScope(
    () => req.db.user.findFirst({ where: { id } }),
    'Utilisateur introuvable'
  );

  if (existing.role === 'OWNER') {
    return res.status(403).json({ message: 'Impossible de modifier le compte propriétaire ici' });
  }

  if (data.establishmentId) {
    await assertInScope(
      () => req.db.establishment.findFirst({ where: { id: data.establishmentId } }),
      'Établissement introuvable'
    );
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      establishmentId: true,
      isActive: true,
    },
  });

  res.status(200).json({ user });
};

// POST /api/users/:id/reset-password — réservé à OWNER/ADMIN (via les routes),
// pour un employé qui a oublié son mot de passe. Ne demande pas l'ancien mot
// de passe, contrairement à changePassword dans auth.controller.ts qui reste
// réservé à l'utilisateur changeant lui-même le sien.
export const resetUserPassword = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body as ResetPasswordInput;

  if (id === req.user!.id) {
    return res
      .status(400)
      .json({ message: 'Utilise le changement de mot de passe depuis ton profil' });
  }

  const existing = await assertInScope(
    () => req.db.user.findFirst({ where: { id } }),
    'Utilisateur introuvable'
  );

  if (existing.role === 'OWNER') {
    return res.status(403).json({ message: 'Impossible de modifier le compte propriétaire ici' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  res.status(200).json({ message: 'Mot de passe réinitialisé' });
};
