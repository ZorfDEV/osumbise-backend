import { Request, Response } from 'express';
import { CashMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { assertInScope } from '../utils/assertInScope';
import { canManageSession, forbiddenSession } from '../utils/cashSessionAccess';
import {
  OpenCashSessionInput,
  CloseCashSessionInput,
  CreateCashMovementInput,
} from '../validators/cashSession.validator';

// Seuls ces types affectent le tiroir-caisse physique. Une vente carte ou
// mobile money ne fait entrer aucun billet, donc n'a pas sa place dans le
// rapprochement théorique/réel — mais reste enregistrée (voir payment.service.ts)
// pour les rapports "ventes par mode de paiement".
const CASH_AFFECTING_TYPES: CashMovementType[] = [
  'SALE_CASH',
  'EXPENSE',
  'REFUND',
  'ADJUSTMENT',
];

export const openCashSession = async (req: Request, res: Response) => {
  const { registerId } = req.params;
  const { openingBalance } = req.body as OpenCashSessionInput;

  await assertInScope(
    () => req.db.cashRegister.findFirst({ where: { id: registerId } }),
    'Caisse introuvable'
  );

  const alreadyOpen = await req.db.cashSession.findFirst({
    where: { cashRegisterId: registerId, closedAt: null },
  });
  if (alreadyOpen) {
    return res.status(409).json({ message: 'Une session est déjà ouverte sur cette caisse' });
  }

  const mine = await req.db.cashSession.findFirst({
    where: { openedById: req.user!.id, closedAt: null },
    include: { cashRegister: { select: { name: true } } },
  });
  if (mine) {
    return res.status(409).json({
      message: `Vous avez déjà une session ouverte sur « ${mine.cashRegister.name} » : clôturez-la d’abord`,
    });
  }

  const session = await prisma.cashSession.create({
    data: {
      cashRegisterId: registerId,
      openedById: req.user!.id,
      openingBalance,
    },
  });

  res.status(201).json({ session });
};

export const listSessionsForRegister = async (req: Request, res: Response) => {
  const { registerId } = req.params;

  await assertInScope(
    () => req.db.cashRegister.findFirst({ where: { id: registerId } }),
    'Caisse introuvable'
  );

  const sessions = await req.db.cashSession.findMany({
    where: {
      cashRegisterId: registerId,
      ...(req.user!.role === 'CASHIER' ? { openedById: req.user!.id } : {}),
    },
    orderBy: { openedAt: 'desc' },
    take: 30,
    include: { openedBy: { select: { name: true } } },
  });

  res.status(200).json({ sessions });
};

export const getCashSession = async (req: Request, res: Response) => {
  const { id } = req.params;

  const session = await req.db.cashSession.findFirst({
    where: { id },
    include: {
      movements: { orderBy: { createdAt: 'asc' } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      // En-tête du rapport de clôture imprimé
      cashRegister: {
        include: {
          establishment: {
            select: { name: true, address: true, logo: true, phone: true, postalBox: true, nif: true, rc: true },
          },
        },
      },
    },
  });

  if (!session) {
    return res.status(404).json({ message: 'Session de caisse introuvable' });
  }
  if (!canManageSession(req, session)) throw forbiddenSession();

  res.status(200).json({ session });
};

export const closeCashSession = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { actualBalance } = req.body as CloseCashSessionInput;

  const session = await assertInScope(
    () => req.db.cashSession.findFirst({ where: { id }, include: { movements: true } }),
    'Session de caisse introuvable'
  );

  if (!canManageSession(req, session)) throw forbiddenSession();
  if (session.closedAt) {
    return res.status(409).json({ message: 'Cette session est déjà clôturée' });
  }

  const cashMovementsTotal = session.movements
    .filter((m) => CASH_AFFECTING_TYPES.includes(m.type))
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const theoreticalBalance = Number(session.openingBalance) + cashMovementsTotal;
  const discrepancy = actualBalance - theoreticalBalance;

  const closed = await prisma.cashSession.update({
    where: { id },
    data: {
      closedById: req.user!.id,
      closedAt: new Date(),
      theoreticalBalance,
      actualBalance,
      discrepancy,
    },
  });

  res.status(200).json({ session: closed });
};

export const createCashMovement = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { type, amount, note } = req.body as CreateCashMovementInput;

  const session = await assertInScope(
    () => req.db.cashSession.findFirst({ where: { id } }),
    'Session de caisse introuvable'
  );

  if (!canManageSession(req, session)) throw forbiddenSession();
  if (session.closedAt) {
    return res.status(409).json({ message: 'Cette session de caisse est déjà clôturée' });
  }

  // L'utilisateur saisit toujours une magnitude positive pour une dépense ou
  // un remboursement ; c'est ici qu'elle devient une sortie d'argent (négative).
  // Un ajustement peut aller dans les deux sens, on respecte le signe fourni.
  const signedAmount = type === 'ADJUSTMENT' ? amount : -Math.abs(amount);

  const movement = await prisma.cashMovement.create({
    data: { cashSessionId: id, type, amount: signedAmount, note },
  });

  res.status(201).json({ movement });
};

// GET /api/cash-sessions/mine — la session ouverte de l'utilisateur connecté,
// où vont ses encaissements. Propriétaire / administrateur sans session à lui :
// la session ouverte de l'établissement, comme avant.
export const getMyCashSession = async (req: Request, res: Response) => {
  const include = { cashRegister: { select: { name: true } }, openedBy: { select: { name: true } } };
  let session = await req.db.cashSession.findFirst({
    where: { openedById: req.user!.id, closedAt: null },
    include,
  });
  if (!session && req.user!.role !== 'CASHIER') {
    session = await req.db.cashSession.findFirst({ where: { closedAt: null }, orderBy: { openedAt: 'asc' }, include });
  }
  res.status(200).json({ session });
};
