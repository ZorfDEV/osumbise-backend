import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { signToken, COOKIE_MAX_AGE } from '../utils/jwt';
import { RegisterInput, LoginInput, UpdateProfileInput, ChangePasswordInput } from '../validators/auth.validator';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: COOKIE_MAX_AGE,
};

// Détermine le type d'établissement à utiliser pour réorganiser la sidebar
// côté frontend (masquer Tables/Cuisine pour un Grossiste, par ex). Si
// l'utilisateur a un établissement fixe (tous les rôles sauf OWNER), on
// utilise directement le sien. Pour un OWNER (établissement non fixe, peut
// en gérer plusieurs), on retombe sur le premier établissement créé de son
// organisation — approximation raisonnable tant qu'il n'existe pas de
// sélecteur d'établissement actif pour les comptes multi-établissements.
async function resolveEstablishmentType(
  establishmentId: string | null,
  organizationId: string
) {
  if (establishmentId) {
    const establishment = await prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { type: true },
    });
    return establishment?.type ?? null;
  }

  const first = await prisma.establishment.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: { type: true },
  });
  return first?.type ?? null;
}

// POST /api/auth/register
// Crée l'organisation ET son premier utilisateur (OWNER) en une transaction :
// on ne veut jamais se retrouver avec une organisation sans propriétaire.
// Ne crée PAS d'abonnement ici — c'est fait séparément par POST /api/subscription
// une fois l'utilisateur connecté, sur la page /subscribe dédiée.
export const register = async (req: Request, res: Response) => {
  const { organizationName, name, email, password, establishmentName, establishmentType } =
    req.body as RegisterInput;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: 'Cet email est déjà utilisé' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { organization, user, establishment } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName },
    });

    // Créé immédiatement (avant même le choix de formule sur /subscribe) —
    // aucune limite de plan à vérifier ici puisqu'aucun abonnement n'existe
    // encore : checkEstablishmentLimit renvoie toujours null tant que
    // l'organisation n'a pas de Subscription (voir utils/planLimits.ts).
    const establishment = await tx.establishment.create({
      data: { organizationId: organization.id, name: establishmentName, type: establishmentType },
    });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        name,
        email,
        passwordHash,
        role: 'OWNER',
      },
    });

    return { organization, user, establishment };
  });

  const token = signToken({
    id: user.id,
    organizationId: user.organizationId,
    establishmentId: user.establishmentId,
    role: user.role,
  });

  res.cookie('token', token, cookieOptions);

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      establishmentId: user.establishmentId,
      establishment: null, // pas d'établissement FIXE pour un OWNER (voir Topbar.tsx)
      establishmentType: establishment.type,
      organization: { name: organization.name },
      hasSubscription: false, // le choix du plan se fait juste après, sur /subscribe
      isPlatformAdmin: false,
    },
  });
};

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      establishment: { select: { name: true, logo: true } },
      organization: { select: { name: true } },
    },
  });

  // Même message pour "email inconnu" et "mauvais mot de passe" :
  // ne pas révéler quels emails existent dans le système
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Identifiants incorrects' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Identifiants incorrects' });
  }

  const token = signToken({
    id: user.id,
    organizationId: user.organizationId,
    establishmentId: user.establishmentId,
    role: user.role,
  });

  res.cookie('token', token, cookieOptions);

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: user.organizationId },
    select: { id: true },
  });

  const establishmentType = await resolveEstablishmentType(
    user.establishmentId,
    user.organizationId
  );

  res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      establishmentId: user.establishmentId,
      establishment: user.establishment,
      establishmentType,
      organization: user.organization,
      hasSubscription: !!subscription,
      isPlatformAdmin: user.isPlatformAdmin,
    },
  });
};

// POST /api/auth/logout
export const logout = (req: Request, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.status(200).json({ message: 'Déconnecté' });
};

// GET /api/auth/me — protégée par le middleware `protect`
export const me = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      establishmentId: true,
      isActive: true,
      isPlatformAdmin: true,
      // Un OWNER n'a pas d'establishmentId fixe (voir resolveEstablishmentId) :
      // establishment sera alors null, le frontend retombe sur organization.name
      establishment: { select: { name: true, logo: true } },
      organization: { select: { name: true } },
    },
  });

  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: user.organizationId },
    select: { id: true },
  });

  const establishmentType = await resolveEstablishmentType(
    user.establishmentId,
    user.organizationId
  );

  res.status(200).json({ user: { ...user, hasSubscription: !!subscription, establishmentType } });
};

// PATCH /api/auth/me — mise à jour du profil par l'utilisateur lui-même
export const updateProfile = async (req: Request, res: Response) => {
  const { name, email } = req.body as UpdateProfileInput;

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== req.user!.id) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name, email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      establishmentId: true,
    },
  });

  res.status(200).json({ user });
};

// POST /api/auth/change-password — l'utilisateur change lui-même son mot de
// passe, en confirmant l'ancien (contrairement à la réinitialisation par un
// admin dans user.controller.ts, qui n'exige pas l'ancien mot de passe)
export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Mot de passe actuel incorrect' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } });

  res.status(200).json({ message: 'Mot de passe mis à jour' });
};
