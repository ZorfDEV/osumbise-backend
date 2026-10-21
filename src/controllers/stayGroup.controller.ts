import { Request, Response } from 'express';
import { CashMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { assertUsableCashSession } from '../utils/cashSessionAccess';
import { emitToEstablishment } from '../realtime/socket';
import { assertCreditAllowed } from '../services/customerCredit.service';
import { AddStayPaymentInput, CreateStayGroupInput } from '../validators/hotel.validator';
import {
  addDays,
  assertRoomFree,
  computeTotals,
  nextHotelInvoiceNumber,
  httpError,
  stayDetailInclude,
  taxFor,
  toDay,
  today,
  withTotals,
} from '../services/stay.service';

// Réservation de groupe : plusieurs chambres au nom d'une entreprise, une
// facture unique. Chaque chambre reste un séjour à part entière ; le groupe
// les rassemble pour l'arrivée, le départ, l'encaissement et la facture.

const notify = (establishmentId: string) => emitToEstablishment(establishmentId, 'hotel:updated', {});

const groupInclude = {
  customer: { select: { id: true, name: true, balance: true, creditLimit: true } },
  establishment: { select: { name: true, address: true, logo: true, phone: true, email: true, postalBox: true, nif: true, rc: true } },
  user: { select: { name: true } },
  stays: { include: stayDetailInclude, orderBy: { createdAt: 'asc' as const } },
};

const loadGroup = (req: Request, id: string) =>
  assertInScope(() => req.db.stayGroup.findFirst({ where: { id }, include: groupInclude }), 'Groupe introuvable');

type LoadedGroup = Awaited<ReturnType<typeof loadGroup>>;

// Totaux du groupe : somme des séjours non annulés
const withGroupTotals = (group: LoadedGroup) => {
  const stays = group.stays.map(withTotals);
  const billed = stays.filter((s) => s.status !== 'CANCELLED');
  const sum = (k: keyof (typeof billed)[number]['totals']) =>
    Math.round(billed.reduce((total, s) => total + s.totals[k], 0) * 100) / 100;
  return {
    ...group,
    stays,
    totals: {
      rooms: billed.length,
      nights: sum('nights'),
      lodging: sum('lodging'),
      tax: sum('tax'),
      charges: sum('charges'),
      services: sum('services'),
      discount: sum('discount'),
      total: sum('total'),
      paid: sum('paid'),
      balance: sum('balance'),
    },
  };
};

// GET /api/hotel/groups — groupes récents (réservés ou en cours d'abord)
export const listStayGroups = async (req: Request, res: Response) => {
  const groups = await req.db.stayGroup.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      customer: { select: { name: true } },
      stays: { select: { id: true, status: true, checkInDate: true, checkOutDate: true } },
    },
  });
  res.status(200).json({ groups });
};

// GET /api/hotel/groups/:id
export const getStayGroup = async (req: Request, res: Response) => {
  const group = await loadGroup(req, req.params.id);
  res.status(200).json({ group: withGroupTotals(group) });
};

// POST /api/hotel/groups — crée le groupe et un séjour par chambre
export const createStayGroup = async (req: Request, res: Response) => {
  const data = req.body as CreateStayGroupInput;
  const establishmentId = await resolveEstablishmentId(req);

  const customer = data.customerId
    ? await assertInScope(() => req.db.customer.findFirst({ where: { id: data.customerId } }), 'Client introuvable')
    : null;

  const rooms = await req.db.room.findMany({
    where: { id: { in: data.rooms.map((r) => r.roomId) }, isActive: true },
  });
  if (rooms.length !== data.rooms.length) throw httpError('Une chambre est introuvable ou retirée de la vente', 404);
  if (rooms.some((r) => r.establishmentId !== establishmentId)) {
    throw httpError('Les chambres doivent appartenir à l’établissement actif', 400);
  }

  const checkIn = data.checkInNow ? today() : toDay(data.checkInDate);
  if (checkIn < today()) throw httpError('Impossible de réserver à une date passée : l’arrivée doit être aujourd’hui ou plus tard', 400);
  let checkOut = toDay(data.checkOutDate);
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);

  // Toutes les chambres doivent être libres sur la période : rien n'est créé sinon
  for (const room of rooms) {
    if (data.checkInNow) {
      if (room.status === 'OUT_OF_SERVICE') throw httpError(`Chambre ${room.number} hors service`, 409);
      const occupied = await prisma.stay.findFirst({ where: { roomId: room.id, status: 'CHECKED_IN' } });
      if (occupied) throw httpError(`Chambre ${room.number} occupée par ${occupied.guestName}`, 409);
    }
    try {
      await assertRoomFree(room.id, checkIn, checkOut);
    } catch (err) {
      throw httpError(`Chambre ${room.number} : ${(err as Error).message}`, 409);
    }
  }

  const taxes = new Map<string, number>();
  for (const room of rooms) {
    if (!taxes.has(room.category)) taxes.set(room.category, await taxFor(establishmentId, room.category));
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.stayGroup.create({
      data: {
        establishmentId,
        number: await nextHotelInvoiceNumber(tx, establishmentId),
        name: data.name,
        customerId: customer?.id ?? null,
        contactPhone: data.contactPhone || null,
        notes: data.notes || null,
        userId: req.user!.id,
      },
    });
    for (const line of data.rooms) {
      const room = rooms.find((r) => r.id === line.roomId)!;
      await tx.stay.create({
        data: {
          establishmentId,
          number: await nextHotelInvoiceNumber(tx, establishmentId),
          roomId: room.id,
          groupId: created.id,
          // Entreprise du groupe : les séjours figurent dans son historique
          customerId: customer?.id ?? null,
          guestName: line.guestName || data.name,
          guestPhone: data.contactPhone || null,
          adults: line.adults,
          children: line.children,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          nightlyRate: line.nightlyRate ?? room.nightlyRate,
          taxPerNight: taxes.get(room.category) ?? 0,
          userId: req.user!.id,
          ...(data.checkInNow ? { status: 'CHECKED_IN' as const, checkedInAt: new Date() } : {}),
        },
      });
      if (data.checkInNow) await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    }
    return created;
  });

  notify(establishmentId);
  res.status(201).json({ group: withGroupTotals(await loadGroup(req, group.id)) });
};

// POST /api/hotel/groups/:id/check-in — arrivée de toutes les chambres réservées
export const checkInStayGroup = async (req: Request, res: Response) => {
  const group = await loadGroup(req, req.params.id);
  const reserved = group.stays.filter((s) => s.status === 'RESERVED');
  if (reserved.length === 0) throw httpError('Aucune chambre du groupe n’attend son arrivée', 409);

  const arrival = today();
  for (const stay of reserved) {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: stay.roomId } });
    if (room.status === 'OUT_OF_SERVICE') throw httpError(`Chambre ${room.number} hors service : changez de chambre`, 409);
    const occupied = await prisma.stay.findFirst({ where: { roomId: room.id, status: 'CHECKED_IN' } });
    if (occupied) throw httpError(`Chambre ${room.number} encore occupée par ${occupied.guestName}`, 409);
    const checkOut = stay.checkOutDate <= arrival ? addDays(arrival, 1) : stay.checkOutDate;
    await assertRoomFree(room.id, arrival, checkOut, stay.id);
  }

  await prisma.$transaction(async (tx) => {
    for (const stay of reserved) {
      const checkOut = stay.checkOutDate <= arrival ? addDays(arrival, 1) : stay.checkOutDate;
      await tx.stay.update({
        where: { id: stay.id },
        data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkInDate: arrival, checkOutDate: checkOut },
      });
      await tx.room.update({ where: { id: stay.roomId }, data: { status: 'OCCUPIED' } });
    }
  });

  notify(group.establishmentId);
  res.status(200).json({ group: withGroupTotals(await loadGroup(req, group.id)) });
};

// POST /api/hotel/groups/:id/check-out { force?: boolean } — départ du groupe.
// Refusé s'il reste un solde sur la facture du groupe, sauf confirmation.
export const checkOutStayGroup = async (req: Request, res: Response) => {
  const group = await loadGroup(req, req.params.id);
  const inHouse = group.stays.filter((s) => s.status === 'CHECKED_IN');
  if (inHouse.length === 0) throw httpError('Aucune chambre du groupe n’est occupée', 409);

  const departure = today();
  const departureOf = (s: { checkInDate: Date }) => (departure > s.checkInDate ? departure : addDays(s.checkInDate, 1));

  // Solde du groupe avec les nuits réelles des chambres qui partent
  const balance = group.stays
    .filter((s) => s.status !== 'CANCELLED')
    .reduce((sum, s) => {
      const preview = s.status === 'CHECKED_IN' ? { ...s, checkOutDate: departureOf(s) } : s;
      return sum + computeTotals(preview).balance;
    }, 0);
  if (balance > 0 && !(req.body as { force?: boolean })?.force) {
    return res.status(409).json({
      message: `Reste à payer pour le groupe : ${Math.round(balance).toLocaleString('fr-FR')} FCFA`,
      code: 'BALANCE_DUE',
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const stay of inHouse) {
      await tx.stay.update({
        where: { id: stay.id },
        data: { status: 'CHECKED_OUT', checkedOutAt: new Date(), checkOutDate: departureOf(stay) },
      });
      await tx.room.update({ where: { id: stay.roomId }, data: { status: 'CLEANING' } });
    }
  });

  notify(group.establishmentId);
  res.status(200).json({ group: withGroupTotals(await loadGroup(req, group.id)) });
};

const PAYMENT_TO_CASH_MOVEMENT: Partial<Record<AddStayPaymentInput['method'], CashMovementType>> = {
  CASH: 'SALE_CASH',
  CARD: 'SALE_CARD',
  MOBILE_MONEY: 'SALE_MOBILE_MONEY',
};

// POST /api/hotel/groups/:id/payments — acompte ou solde du groupe.
// Le montant est réparti sur les chambres qui restent dues (la plus ancienne
// d'abord) ; un trop-perçu reste sur la dernière. Un seul mouvement de caisse,
// et « Compte client » débite une seule fois le compte de l'entreprise.
export const addStayGroupPayment = async (req: Request, res: Response) => {
  const group = await loadGroup(req, req.params.id);
  const { method, amount, note, cashSessionId, customerId } = req.body as AddStayPaymentInput;

  const billed = group.stays.filter((s) => s.status !== 'CANCELLED').map(withTotals);
  if (billed.length === 0) throw httpError('Aucune chambre à facturer dans ce groupe', 409);

  const creditCustomerId = method === 'CREDIT' ? customerId ?? group.customerId : null;
  if (method === 'CREDIT' && !creditCustomerId) throw httpError('Choisissez le compte client à débiter', 400);
  const creditCustomer = creditCustomerId
    ? await assertInScope(() => req.db.customer.findFirst({ where: { id: creditCustomerId } }), 'Client introuvable')
    : null;
  if (creditCustomer) assertCreditAllowed(creditCustomer, amount);
  if (cashSessionId) await assertUsableCashSession(req, cashSessionId);

  // Espèces supérieures au reste à payer du groupe : monnaie rendue, seul le
  // dû est réparti sur les chambres et entre en caisse
  const groupDue = Math.max(0, billed.reduce((sum, s) => sum + s.totals.balance, 0));
  if (method === 'CASH' && groupDue <= 0) throw httpError('La facture du groupe est déjà soldée : rien à encaisser', 409);
  const change = method === 'CASH' && amount > groupDue ? Math.round((amount - groupDue) * 100) / 100 : 0;
  const applied = amount - change;

  // Répartition
  const allocations: { stayId: string; amount: number }[] = [];
  let remaining = applied;
  for (const stay of billed) {
    if (remaining <= 0) break;
    const due = Math.max(0, stay.totals.balance);
    const part = Math.min(due, remaining);
    if (part > 0) {
      allocations.push({ stayId: stay.id, amount: part });
      remaining -= part;
    }
  }
  if (remaining > 0) {
    const last = billed[billed.length - 1].id;
    const existing = allocations.find((a) => a.stayId === last);
    if (existing) existing.amount += remaining;
    else allocations.push({ stayId: last, amount: remaining });
  }

  const label = `Versement du groupe ${group.name}${note ? ` — ${note}` : ''}`;
  await prisma.$transaction(async (tx) => {
    for (const [i, a] of allocations.entries()) {
      await tx.stayPayment.create({
        data: {
          stayId: a.stayId,
          method,
          amount: Math.round(a.amount * 100) / 100,
          note: label,
          customerId: creditCustomer?.id ?? null,
          // Montant remis et monnaie rendue : notés une fois, sur le dernier versement
          ...(change > 0 && i === allocations.length - 1 ? { cashReceived: amount, changeGiven: change } : {}),
          userId: req.user!.id,
        },
      });
    }
    if (creditCustomer) {
      await tx.customer.update({ where: { id: creditCustomer.id }, data: { balance: { increment: amount } } });
    }
    const movementType = PAYMENT_TO_CASH_MOVEMENT[method];
    if (cashSessionId && movementType) {
      await tx.cashMovement.create({
        data: { cashSessionId, type: movementType, amount: applied, note: `Groupe ${group.name} (${billed.length} chambres)` },
      });
    }
  });

  notify(group.establishmentId);
  res.status(201).json({ group: withGroupTotals(await loadGroup(req, group.id)) });
};
