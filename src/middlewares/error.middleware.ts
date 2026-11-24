import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

interface AppError extends Error {
  status?: number;
}

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ message: 'Route non trouvée' });
};

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err.stack);

  // Contrainte unique violée (ex. deux inscriptions concurrentes avec le même email)
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return res.status(409).json({ message: 'Cette valeur existe déjà' });
  }

  // Erreur prévue (httpError…) : son message est destiné à l'utilisateur. Toute
  // autre (Prisma, bug) reste dans les journaux : son message technique
  // révélerait des tables, des requêtes ou des chemins de fichiers.
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({
    message: status === 500 ? 'Erreur serveur : réessayez, ou contactez le support si le problème persiste' : err.message,
  });
};
