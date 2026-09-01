import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { signToken, COOKIE_MAX_AGE } from '../utils/jwt';
import { RegisterInput, LoginInput } from '../validators/auth.validator';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: COOKIE_MAX_AGE,
};

// POST /api/auth/register
// Crée l'organisation ET son premier utilisateur (OWNER) en une transaction :
// on ne veut jamais se retrouver avec une organisation sans propriétaire.
export const register = async (req: Request, res: Response) => {
  const { organizationName, name, email, password } = req.body as RegisterInput;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: 'Cet email est déjà utilisé' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { organization, user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName },
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

    return { organization, user };
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
    },
    organization: {
      id: organization.id,
      name: organization.name,
    },
  });
};

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({ where: { email } });

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

  res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      establishmentId: user.establishmentId,
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
    },
  });

  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }

  res.status(200).json({ user });
};
