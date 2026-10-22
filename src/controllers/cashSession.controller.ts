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
import { nightsBetween } from '../services/stay.service';

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
  const { openingBalance, plannedCloseAt } = req.body as OpenCashSessionInput;

  const register = await assertInScope(
    () => req.db.cashRegister.findFirst({ where: { id: registerId } }),
    'Caisse introuvable'
  );
  if (register.isLocked) {
    return res.status(409).json({
      message: `Caisse verrouillée par le propriétaire${register.lockedReason ? ` : ${register.lockedReason}` : ''}`,
    });
  }

  // Fin de service prévue : obligatoire pour une caissière, dans les 24 h
  const now = new Date();
  if (req.user!.role === 'CASHIER' && !plannedCloseAt) {
    return res.status(400).json({ message: 'Indiquez l’heure de fin de votre service' });
  }
  if (plannedCloseAt && (plannedCloseAt <= now || plannedCloseAt.getTime() - now.getTime() > 24 * 60 * 60 * 1000)) {
    return res.status(400).json({ message: 'L’heure de fin doit être dans les 24 heures à venir' });
  }

  // Une caissière ouvre au plus 2 sessions par jour (jour de Libreville, UTC+1)
  if (req.user!.role === 'CASHIER') {
    const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000;
    const local = new Date(now.getTime() + LIBREVILLE_OFFSET_MS);
    const startOfDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - LIBREVILLE_OFFSET_MS);
    const todayCount = await req.db.cashSession.count({
      where: { openedById: req.user!.id, openedAt: { gte: startOfDay } },
    });
    if (todayCount >= 2) {
      return res.status(409).json({ message: 'Vous avez déjà ouvert 2 sessions aujourd’hui : maximum atteint' });
    }
  }

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
      plannedCloseAt: plannedCloseAt ?? null,
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
            select: { name: true, address: true, logo: true, phone: true, email: true, postalBox: true, nif: true, rc: true },
          },
        },
      },
    },
  });

  if (!session) {
    return res.status(404).json({ message: 'Session de caisse introuvable' });
  }
  if (!canManageSession(req, session)) throw forbiddenSession();

  // Factures encaissées dans la session : tous modes de paiement (rattachées
  // au paiement), plus les anciennes ventes connues par leurs mouvements
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ payments: { some: { cashSessionId: id } } }, { cashMovements: { some: { cashSessionId: id } } }],
    },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      table: { select: { label: true } },
      customer: { select: { name: true } },
      items: { select: { quantity: true, product: { select: { id: true, name: true } } } },
      payments: { select: { method: true, amount: true } },
    },
  });

  // Hôtel : versements de séjours encaissés dans la session. Chaque séjour
  // compte une fois, en nuitées × tarif, regroupé par catégorie de chambre
  const stayPayments = await prisma.stayPayment.findMany({
    where: { cashSessionId: id },
    select: {
      method: true,
      amount: true,
      stay: {
        select: {
          id: true,
          status: true,
          nightlyRate: true,
          checkInDate: true,
          checkOutDate: true,
          room: { select: { category: true } },
        },
      },
    },
  });
  const byMethod = new Map<string, number>();
  const stays = new Map<string, (typeof stayPayments)[number]['stay']>();
  for (const p of stayPayments) {
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));
    // Réservation annulée (avance remboursée ou conservée) : aucune nuit vendue
    if (p.stay.status !== 'CANCELLED') stays.set(p.stay.id, p.stay);
  }
  const roomLines = new Map<string, { category: string; nightlyRate: number; nights: number; amount: number }>();
  for (const st of stays.values()) {
    const rate = Number(st.nightlyRate);
    const nights = nightsBetween(st.checkInDate, st.checkOutDate);
    const key = `${st.room.category}-${rate}`;
    const line = roomLines.get(key) ?? { category: st.room.category, nightlyRate: rate, nights: 0, amount: 0 };
    line.nights += nights;
    line.amount += nights * rate;
    roomLines.set(key, line);
  }
  const CATEGORY_ORDER = ['STANDARD', 'VIP', 'SUITE'];
  const hotel = {
    rooms: [...roomLines.values()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.nightlyRate - b.nightlyRate
    ),
    payments: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })).filter((p) => p.amount !== 0),
  };

  res.status(200).json({ session: { ...session, orders, hotel } });
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
  // Une dépense ne peut être saisie que par le propriétaire ou l'administrateur
  if (type === 'EXPENSE' && req.user!.role === 'CASHIER') {
    return res.status(403).json({ message: 'Les dépenses sont saisies par le propriétaire ou l’administrateur' });
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

// GET /api/cash-sessions/daily?date=YYYY-MM-DD — récapitulatif par caissière :
// sessions ouvertes ce jour-là, ventes par mode, total et écart (responsables)
export const listDailySessions = async (req: Request, res: Response) => {
  const day = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sessions = await req.db.cashSession.findMany({
    where: { openedAt: { gte: start, lt: end } },
    orderBy: { openedAt: 'asc' },
    include: {
      openedBy: { select: { id: true, name: true } },
      cashRegister: { select: { name: true } },
      movements: { select: { type: true, amount: true, orderId: true } },
    },
  });

  const rows = sessions.map((s) => {
    const sum = (type: string) =>
      s.movements.filter((m) => m.type === type).reduce((total, m) => total + Number(m.amount), 0);
    const cash = sum('SALE_CASH');
    const mobile = sum('SALE_MOBILE_MONEY');
    const card = sum('SALE_CARD');
    const sales = new Set(s.movements.filter((m) => m.type.startsWith('SALE_')).map((m) => m.orderId)).size;
    return {
      id: s.id,
      cashier: s.openedBy,
      register: s.cashRegister.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      sales,
      cash,
      mobile,
      card,
      total: cash + mobile + card,
      discrepancy: s.discrepancy === null ? null : Number(s.discrepancy),
    };
  });
  res.status(200).json({ sessions: rows });
};
