import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';

interface JwtPayload {
  id: string;
  organizationId: string;
  establishmentId: string | null;
  role: Role;
}

// Relit le compte en base : un utilisateur désactivé perd l'accès tout de
// suite, et un changement de rôle ou d'établissement s'applique sans attendre
// l'expiration du jeton (24 h). Partagé avec l'authentification Socket.IO.
export const loadActiveUser = async (token: string): Promise<JwtPayload | null> => {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: { id: true, organizationId: true, establishmentId: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    organizationId: user.organizationId,
    establishmentId: user.establishmentId,
    role: user.role,
  };
};

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  // Cookie HttpOnly pour le dashboard web, header Bearer pour l'app mobile React Native
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  try {
    const user = await loadActiveUser(token);
    if (!user) {
      return res.status(401).json({ message: 'Session invalide ou expirée' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// Usage : authorize('OWNER', 'ADMIN')
export const authorize =
  (...allowedRoles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    next();
  };

// Réservé au tableau de bord plateforme (gestion transverse de toutes les
// organisations). Vérifié en base à chaque requête plutôt que via une
// information portée par le JWT, pour qu'une révocation d'accès soit
// immédiate plutôt que d'attendre l'expiration du jeton en cours.
export const requirePlatformAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isPlatformAdmin: true },
    });

    if (!user?.isPlatformAdmin) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs de la plateforme' });
    }

    next();
  } catch (err) {
    next(err);
  }
};
