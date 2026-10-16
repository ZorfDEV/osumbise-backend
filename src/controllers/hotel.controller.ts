import { Request, Response } from 'express';
import { CashMovementType, Prisma, RoomCategory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { emitToEstablishment } from '../realtime/socket';
import { assertCreditAllowed } from '../services/customerCredit.service';
import {
  AddStayPaymentInput,
  CreateRoomInput,
  CreateStayInput,
  UpdateRoomInput,
  UpdateStayInput,
  UpdateTaxRatesInput,
} from '../validators/hotel.validator';
import {
  addDays,
  assertRoomFree,
  httpError,
  stayDetailInclude,
  taxFor,
  toDay,
  today,
  withTotals,
} from '../services/stay.service';

const CATEGORIES: RoomCategory[] = ['STANDARD', 'VIP', 'SUITE'];

// Les autres écrans de réception (plan des chambres, planning) se rafraîchissent
const notify = (establishmentId: string) => emitToEstablishment(establishmentId, 'hotel:updated', {});

const loadStay = (req: Request, id: string) =>
  assertInScope(() => req.db.stay.findFirst({ where: { id }, include: stayDetailInclude }), 'Séjour introuvable');

// =====================================================================
// Chambres
// =====================================================================

// GET /api/hotel/rooms — avec le séjour en cours et la prochaine arrivée
export const listRooms = async (req: Request, res: Response) => {
  const rooms = await req.db.room.findMany({
    orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    include: {
      stays: {
        where: { status: { in: ['RESERVED', 'CHECKED_IN'] }, checkOutDate: { gte: today() } },
        orderBy: { checkInDate: 'asc' },
        take: 3,
        select: { id: true, guestName: true, status: true, checkInDate: true, checkOutDate: true },
      },
    },
  });
  res.status(200).json({ rooms });
};

export const createRoom = async (req: Request, res: Response) => {
  const data = req.body as CreateRoomInput;
  const establishmentId = await resolveEstablishmentId(req);

  const exists = await prisma.room.findUnique({
    where: { establishmentId_number: { establishmentId, number: data.number } },
  });
  if (exists) throw httpError(`La chambre ${data.number} existe déjà`, 409);

  const room = await prisma.room.create({
    data: {
      establishmentId,
      number: data.number,
      category: data.category,
      floor: data.floor || null,
      capacity: data.capacity,
      nightlyRate: data.nightlyRate,
      notes: data.notes || null,
    },
  });
  notify(establishmentId);
  res.status(201).json({ room });
};

export const updateRoom = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateRoomInput;
  const existing = await assertInScope(() => req.db.room.findFirst({ where: { id } }), 'Chambre introuvable');

  if (data.number && data.number !== existing.number) {
    const taken = await prisma.room.findUnique({
      where: { establishmentId_number: { establishmentId: existing.establishmentId, number: data.number } },
    });
    if (taken) throw httpError(`La chambre ${data.number} existe déjà`, 409);
  }

  const room = await prisma.room.update({
    where: { id },
    data: {
      ...data,
      floor: data.floor === undefined ? undefined : data.floor || null,
      notes: data.notes === undefined ? undefined : data.notes || null,
    },
  });
  notify(existing.establishmentId);
  res.status(200).json({ room });
};

// PATCH /api/hotel/rooms/:id/status — ménage terminé, hors service…
export const updateRoomStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status: 'AVAILABLE' | 'CLEANING' | 'OUT_OF_SERVICE' };
  const room = await assertInScope(() => req.db.room.findFirst({ where: { id } }), 'Chambre introuvable');

  const occupied = await prisma.stay.findFirst({ where: { roomId: id, status: 'CHECKED_IN' } });
  if (occupied) {
    throw httpError(`Chambre occupée par ${occupied.guestName} : enregistrez d’abord son départ`, 409);
  }

  const updated = await prisma.room.update({ where: { id }, data: { status } });
  notify(room.establishmentId);
  res.status(200).json({ room: updated });
};

// =====================================================================
// Taxe de séjour (par type de chambre)
// =====================================================================

export const listTaxRates = async (req: Request, res: Response) => {
  const rows = await req.db.roomCategoryTax.findMany();
  // Les trois types toujours présents, 0 si non configuré
  const rates = CATEGORIES.map((category) => ({
    category,
    taxPerNight: Number(rows.find((r) => r.category === category)?.taxPerNight ?? 0),
  }));
  res.status(200).json({ rates });
};

export const updateTaxRates = async (req: Request, res: Response) => {
  const { rates } = req.body as UpdateTaxRatesInput;
  const establishmentId = await resolveEstablishmentId(req);
  await prisma.$transaction(
    rates.map((r) =>
      prisma.roomCategoryTax.upsert({
        where: { establishmentId_category: { establishmentId, category: r.category } },
        create: { establishmentId, category: r.category, taxPerNight: r.taxPerNight },
        update: { taxPerNight: r.taxPerNight },
      })
    )
  );
  res.status(200).json({ rates });
};

// =====================================================================
// Séjours
// =====================================================================

// GET /api/hotel/stays?status=&from=&to= — from/to : séjours qui chevauchent
// la période (planning)
export const listStays = async (req: Request, res: Response) => {
  const { status, from, to } = req.query as { status?: string; from?: string; to?: string };
  const where: Prisma.StayWhereInput = {};
  if (status) where.status = { in: status.split(',') as Prisma.EnumStayStatusFilter['in'] };
  if (from) where.checkOutDate = { gt: toDay(from) };
  if (to) where.checkInDate = { lt: toDay(to) };

  const stays = await req.db.stay.findMany({
    where,
    orderBy: { checkInDate: 'asc' },
    include: { room: { select: { id: true, number: true, category: true } }, payments: { select: { amount: true } } },
    take: 500,
  });
  res.status(200).json({ stays });
};

export const getStay = async (req: Request, res: Response) => {
  const stay = await loadStay(req, req.params.id);
  res.status(200).json({ stay: withTotals(stay) });
};

export const createStay = async (req: Request, res: Response) => {
  const data = req.body as CreateStayInput;
  const room = await assertInScope(
    () => req.db.room.findFirst({ where: { id: data.roomId, isActive: true } }),
    'Chambre introuvable ou retirée de la vente'
  );

  // Arrivée immédiate (client sans réservation) : à partir d'aujourd'hui
  const checkIn = data.checkInNow ? today() : toDay(data.checkInDate);
  let checkOut = toDay(data.checkOutDate);
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);

  if (data.checkInNow) {
    if (room.status === 'OUT_OF_SERVICE') throw httpError('Chambre hors service', 409);
    const occupied = await prisma.stay.findFirst({ where: { roomId: room.id, status: 'CHECKED_IN' } });
    if (occupied) throw httpError(`Chambre occupée par ${occupied.guestName}`, 409);
  }
  await assertRoomFree(room.id, checkIn, checkOut);

  const taxPerNight = await taxFor(room.establishmentId, room.category);

  const stay = await prisma.$transaction(async (tx) => {
    const created = await tx.stay.create({
      data: {
        establishmentId: room.establishmentId,
        roomId: room.id,
        guestName: data.guestName,
        guestPhone: data.guestPhone || null,
        guestIdNumber: data.guestIdNumber || null,
        adults: data.adults,
        children: data.children,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        nightlyRate: data.nightlyRate ?? room.nightlyRate,
        taxPerNight,
        notes: data.notes || null,
        userId: req.user!.id,
        ...(data.checkInNow ? { status: 'CHECKED_IN' as const, checkedInAt: new Date() } : {}),
      },
    });
    if (data.checkInNow) await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    return tx.stay.findUniqueOrThrow({ where: { id: created.id }, include: stayDetailInclude });
  });

  notify(room.establishmentId);
  res.status(201).json({ stay: withTotals(stay) });
};

export const updateStay = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  const data = req.body as UpdateStayInput;
  if (existing.status === 'CHECKED_OUT' || existing.status === 'CANCELLED') {
    throw httpError('Ce séjour est terminé ou annulé : il ne peut plus être modifié', 409);
  }

  let room = existing.room;
  let nightlyRate = data.nightlyRate;
  let taxPerNight: number | undefined;
  if (data.roomId && data.roomId !== existing.roomId) {
    const newRoom = await assertInScope(
      () => req.db.room.findFirst({ where: { id: data.roomId, isActive: true } }),
      'Chambre introuvable ou retirée de la vente'
    );
    room = newRoom;
    // Nouveau type de chambre : tarif et taxe suivent, sauf tarif négocié saisi
    nightlyRate = nightlyRate ?? Number(newRoom.nightlyRate);
    taxPerNight = await taxFor(newRoom.establishmentId, newRoom.category);
    if (existing.status === 'CHECKED_IN') {
      const occupied = await prisma.stay.findFirst({ where: { roomId: newRoom.id, status: 'CHECKED_IN' } });
      if (occupied) throw httpError(`Chambre occupée par ${occupied.guestName}`, 409);
    }
  }

  // Séjour en cours : l'arrivée a eu lieu, sa date ne change plus
  const checkIn = existing.status === 'CHECKED_IN' || !data.checkInDate ? existing.checkInDate : toDay(data.checkInDate);
  const checkOut = data.checkOutDate ? toDay(data.checkOutDate) : existing.checkOutDate;
  if (checkOut <= checkIn) throw httpError('La date de départ doit être après la date d’arrivée', 400);
  await assertRoomFree(room.id, checkIn, checkOut, existing.id);

  const stay = await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: existing.id },
      data: {
        roomId: room.id,
        guestName: data.guestName,
        guestPhone: data.guestPhone,
        guestIdNumber: data.guestIdNumber,
        adults: data.adults,
        children: data.children,
        notes: data.notes,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        nightlyRate,
        taxPerNight,
      },
    });
    // Changement de chambre en cours de séjour : l'ancienne est à nettoyer
    if (existing.status === 'CHECKED_IN' && room.id !== existing.roomId) {
      await tx.room.update({ where: { id: existing.roomId }, data: { status: 'CLEANING' } });
      await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    }
    return tx.stay.findUniqueOrThrow({ where: { id: existing.id }, include: stayDetailInclude });
  });

  notify(existing.establishmentId);
  res.status(200).json({ stay: withTotals(stay) });
};

// POST /api/hotel/stays/:id/check-in
export const checkIn = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  if (existing.status !== 'RESERVED') throw httpError('Seul un séjour réservé peut être enregistré à l’arrivée', 409);

  const room = await prisma.room.findUniqueOrThrow({ where: { id: existing.roomId } });
  if (room.status === 'OUT_OF_SERVICE') throw httpError('Chambre hors service : changez de chambre', 409);
  const occupied = await prisma.stay.findFirst({ where: { roomId: room.id, status: 'CHECKED_IN' } });
  if (occupied) throw httpError(`Chambre encore occupée par ${occupied.guestName}`, 409);

  // Arrivée en avance ou en retard : on facture les nuits réelles à partir
  // d'aujourd'hui, en conservant la date de départ prévue
  const arrival = today();
  let checkOut = existing.checkOutDate;
  if (checkOut <= arrival) checkOut = addDays(arrival, 1);
  await assertRoomFree(room.id, arrival, checkOut, existing.id);

  const stay = await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: existing.id },
      data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkInDate: arrival, checkOutDate: checkOut },
    });
    await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    return tx.stay.findUniqueOrThrow({ where: { id: existing.id }, include: stayDetailInclude });
  });

  notify(existing.establishmentId);
  res.status(200).json({ stay: withTotals(stay) });
};

// POST /api/hotel/stays/:id/check-out { force?: boolean }
// Refusé s'il reste un solde à payer, sauf confirmation explicite (force)
export const checkOut = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  if (existing.status !== 'CHECKED_IN') throw httpError('Seul un séjour en cours peut être clôturé', 409);

  // Départ réel aujourd'hui : les nuits facturées s'arrêtent là (au moins une)
  const departure = today();
  const checkOutDate = departure > existing.checkInDate ? departure : addDays(existing.checkInDate, 1);
  const preview = withTotals({ ...existing, checkOutDate });
  if (preview.totals.balance > 0 && !(req.body as { force?: boolean })?.force) {
    return res.status(409).json({
      message: `Reste à payer : ${preview.totals.balance.toLocaleString('fr-FR')} FCFA`,
      code: 'BALANCE_DUE',
      totals: preview.totals,
    });
  }

  const stay = await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: existing.id },
      data: { status: 'CHECKED_OUT', checkedOutAt: new Date(), checkOutDate },
    });
    await tx.room.update({ where: { id: existing.roomId }, data: { status: 'CLEANING' } });
    return tx.stay.findUniqueOrThrow({ where: { id: existing.id }, include: stayDetailInclude });
  });

  notify(existing.establishmentId);
  res.status(200).json({ stay: withTotals(stay) });
};

// POST /api/hotel/stays/:id/cancel — réservation non honorée ou annulée
export const cancelStay = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  if (existing.status !== 'RESERVED') throw httpError('Seule une réservation (avant l’arrivée) peut être annulée', 409);
  await prisma.stay.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
  const stay = await loadStay(req, existing.id);
  notify(existing.establishmentId);
  res.status(200).json({ stay: withTotals(stay) });
};

const PAYMENT_TO_CASH_MOVEMENT: Partial<Record<AddStayPaymentInput['method'], CashMovementType>> = {
  CASH: 'SALE_CASH',
  CARD: 'SALE_CARD',
  MOBILE_MONEY: 'SALE_MOBILE_MONEY',
};

// POST /api/hotel/stays/:id/payments — acompte ou solde
export const addStayPayment = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  const { method, amount, note, cashSessionId, customerId } = req.body as AddStayPaymentInput;
  if (existing.status === 'CANCELLED') throw httpError('Séjour annulé', 409);

  // Mise sur compte client : le client doit appartenir au même établissement
  const creditCustomer =
    method === 'CREDIT' && customerId
      ? await assertInScope(() => req.db.customer.findFirst({ where: { id: customerId } }), 'Client introuvable')
      : null;
  if (creditCustomer) assertCreditAllowed(creditCustomer, amount);

  if (cashSessionId) {
    await assertInScope(
      () => req.db.cashSession.findFirst({ where: { id: cashSessionId, closedAt: null } }),
      'Session de caisse invalide, introuvable ou déjà clôturée'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.stayPayment.create({
      data: {
        stayId: existing.id,
        method,
        amount,
        note: note || null,
        customerId: creditCustomer?.id ?? null,
        userId: req.user!.id,
      },
    });
    if (creditCustomer) {
      await tx.customer.update({ where: { id: creditCustomer.id }, data: { balance: { increment: amount } } });
    }
    const movementType = PAYMENT_TO_CASH_MOVEMENT[method];
    if (cashSessionId && movementType) {
      await tx.cashMovement.create({
        data: {
          cashSessionId,
          type: movementType,
          amount,
          note: `Séjour chambre ${existing.room.number} — ${existing.guestName}`,
        },
      });
    }
  });

  const stay = await loadStay(req, existing.id);
  notify(existing.establishmentId);
  res.status(201).json({ stay: withTotals(stay) });
};
