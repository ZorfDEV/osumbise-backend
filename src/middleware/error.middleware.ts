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

  res.status(err.status || 500).json({
    message: err.message || 'Erreur serveur',
  });
};
