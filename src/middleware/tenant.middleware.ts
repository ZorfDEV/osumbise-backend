import { Request, Response, NextFunction } from 'express';
import { getScopedPrisma } from '../utils/scopedPrisma';

// À monter juste après `protect` : construit un client Prisma qui filtre
// automatiquement les lectures et écritures en masse par organisation/établissement,
// selon le rôle de l'utilisateur connecté.
export const scopeTenant = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  req.db = getScopedPrisma(req.user);
  next();
};
