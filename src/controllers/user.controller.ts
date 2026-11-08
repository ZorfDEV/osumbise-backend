import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { CreateUserInput, UpdateUserInput, ResetPasswordInput } from '../validators/user.validator';
import { checkUserLimit } from '../utils/planLimits';

// Un ADMIN ne gère que les employés de son établissement (sauf accès
// multi-établissements donné par le propriétaire), et jamais un autre
// administrateur : sinon il pourrait réinitialiser le mot de passe d'un
// ADMIN multi-établissements et se connecter à sa place.
// Retourne l'établissement auquel limiter l'ADMIN, ou null si aucune limite.
const adminEstablishmentLimit = async (req: Request): Promise<string | null> => {
  if (req.user!.role !== 'ADMIN') return null;
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { multiEstablishment: true, establishmentId: true },
  });
  return me?.multiEstablishment ? null : me?.establishmentId ?? null;
};

const adminCannotManage = async (
  req: Request,
  target: { role: string; establishmentId: string | null }
): Promise<string | null> => {
  if (req.user!.role !== 'ADMIN') return null;
  if (target.role === 'ADMIN') return 'Seul le propriétaire peut gérer un administrateur';
  const limit = await adminEstablishmentLimit(req);
  if (limit && target.establishmentId !== limit) return 'Utilisateur introuvable';
  return null;
};

export const listUsers = async (req: Request, res: Response) => {
  const limit = await adminEstablishmentLimit(req);
  const users = await req.db.user.findMany({
    where: limit ? { establishmentId: limit } : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      establishmentId: true,
      isActive: true,
      multiEstablishment: true,
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
  const forbidden = await adminCannotManage(req, existing);
  if (forbidden) return res.status(403).json({ message: forbidden });
  const limit = await adminEstablishmentLimit(req);
  if (limit && data.establishmentId && data.establishmentId !== limit) {
    return res.status(403).json({ message: 'Impossible de déplacer un employé vers un autre établissement' });
  }

  if (data.establishmentId) {
    await assertInScope(
      () => req.db.establishment.findFirst({ where: { id: data.establishmentId } }),
      'Établissement introuvable'
    );
  }

  // Accès multi-établissements : décidé par le propriétaire, réservé aux
  // administrateurs (retiré si l'utilisateur change de rôle)
  if (data.multiEstablishment !== undefined && req.user!.role !== 'OWNER') {
    return res.status(403).json({ message: 'Seul le propriétaire peut donner l’accès à tous les établissements' });
  }
  if ((data.role ?? existing.role) !== 'ADMIN') data.multiEstablishment = false;

  if (data.email && data.email !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) return res.status(409).json({ message: 'Cet email est déjà utilisé' });
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
      multiEstablishment: true,
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
  const forbidden = await adminCannotManage(req, existing);
  if (forbidden) return res.status(403).json({ message: forbidden });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  res.status(200).json({ message: 'Mot de passe réinitialisé' });
};
