import { Request } from 'express';
import { assertInScope } from './assertInScope';

// Chaque caissier gère SA session de caisse : il est le seul à pouvoir
// l'alimenter (encaissements, mouvements) et la clôturer. Le propriétaire et
// l'administrateur gardent la main sur toutes les sessions (supervision,
// session oubliée ouverte).
export const canManageSession = (req: Request, session: { openedById: string }) =>
  req.user!.role !== 'CASHIER' || session.openedById === req.user!.id;

export const forbiddenSession = () =>
  Object.assign(new Error('Cette session de caisse appartient à un autre caissier'), { status: 403 });

// Session ouverte, dans le périmètre, et utilisable par l'utilisateur connecté
export const assertUsableCashSession = async (req: Request, cashSessionId: string) => {
  const session = await assertInScope(
    () => req.db.cashSession.findFirst({ where: { id: cashSessionId, closedAt: null } }),
    'Session de caisse invalide, introuvable ou déjà clôturée'
  );
  if (!canManageSession(req, session)) throw forbiddenSession();
  return session;
};
