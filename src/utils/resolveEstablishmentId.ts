import { Request } from 'express';
import { prisma } from '../config/prisma';

interface HttpError extends Error {
  status: number;
}

const httpError = (message: string, status: number): HttpError =>
  Object.assign(new Error(message), { status });

export const resolveEstablishmentId = async (req: Request): Promise<string> => {
  // Rôle assigné à un établissement fixe (tous sauf OWNER) : automatique
  if (req.user!.establishmentId) {
    return req.user!.establishmentId;
  }

  // OWNER multi-établissements : doit préciser lequel est visé
  const establishmentId = (req.body.establishmentId || req.query.establishmentId) as
    | string
    | undefined;

  if (!establishmentId) {
    throw httpError(
      'establishmentId requis (un propriétaire peut gérer plusieurs établissements)',
      400
    );
  }

  const establishment = await prisma.establishment.findFirst({
    where: { id: establishmentId, organizationId: req.user!.organizationId },
  });

  if (!establishment) {
    throw httpError('Établissement introuvable', 404);
  }

  return establishmentId;
};
