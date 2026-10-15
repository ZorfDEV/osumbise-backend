import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { getScopedPrisma } from '../utils/scopedPrisma';

// Établissement "actif" choisi par un OWNER dans l'interface :
// - en-tête X-Establishment-Id pour les appels API ;
// - paramètre ?establishmentScope= pour les téléchargements ouverts dans un
//   nouvel onglet (rapports PDF/CSV), qui ne peuvent pas porter d'en-tête.
// Sans l'un ni l'autre, un OWNER garde la vue de toute son organisation
// (tableau de bord et rapports consolidés).
const requestedEstablishment = (req: Request): string | undefined => {
  const header = req.header('x-establishment-id');
  if (header) return header;
  const query = req.query.establishmentScope;
  return typeof query === 'string' && query ? query : undefined;
};

// À monter juste après `protect` : construit un client Prisma qui filtre
// automatiquement les lectures et écritures en masse par organisation/établissement,
// selon le rôle de l'utilisateur connecté.
export const scopeTenant = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  try {
    const requested = requestedEstablishment(req);
    // Seul un OWNER sans établissement fixe peut choisir ; pour les autres
    // rôles, l'établissement vient du JWT et l'en-tête est ignoré.
    if (requested && req.user.role === 'OWNER' && !req.user.establishmentId) {
      // Vérifié en base à chaque requête : impossible de viser l'établissement
      // d'une autre organisation en forgeant l'en-tête
      const establishment = await prisma.establishment.findFirst({
        where: { id: requested, organizationId: req.user.organizationId },
        select: { id: true },
      });
      if (!establishment) {
        return res.status(403).json({ message: 'Établissement non autorisé' });
      }
      // La suite (req.db, resolveEstablishmentId…) se comporte comme pour un
      // utilisateur rattaché à cet établissement
      req.user = { ...req.user, establishmentId: establishment.id };
    }

    req.db = getScopedPrisma(req.user);
    next();
  } catch (err) {
    next(err);
  }
};
