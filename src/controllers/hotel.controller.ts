import { Request, Response } from 'express';
import { CashMovementType, Prisma, RoomCategory } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { assertUsableCashSession } from '../utils/cashSessionAccess';
import { emitToEstablishment } from '../realtime/socket';
import { assertCreditAllowed } from '../services/customerCredit.service';
import { DiscountInput } from '../validators/order.validator';
import {
  AddStayPaymentInput,
  CancelStayInput,
  CreateRoomInput,
  CreateStayInput,
  MoveStayInput,
  UpdateRoomInput,
  UpdateStayInput,
  UpdateTaxRatesInput,
} from '../validators/hotel.validator';
import {
  addDays,
  assertRoomFree,
  computeTotals,
  nextHotelInvoiceNumber,
  parseInvoiceQuery,
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
    orderBy: [{ building: 'asc' }, { floor: 'asc' }, { number: 'asc' }],
    include: {
      stays: {
        // Client en séjour : toujours affiché, même s'il a dépassé sa date de
        // départ prévue (sinon une chambre « Occupée » apparaît sans client).
        // Réservations : seulement celles dont le départ n'est pas passé.
        where: { OR: [{ status: 'CHECKED_IN' }, { status: 'RESERVED', checkOutDate: { gte: today() } }] },
        orderBy: { checkInDate: 'asc' },
        take: 3,
        select: { id: true, guestName: true, status: true, checkInDate: true, checkOutDate: true, group: { select: { id: true, name: true } } },
      },
    },
  });

  // État de la facture des séjours en cours (payée, avance, non payée),
  // affiché sur les cartes des chambres occupées
  const inHouseIds = rooms.flatMap((r) => r.stays.filter((s) => s.status === 'CHECKED_IN').map((s) => s.id));
  const details = inHouseIds.length
    ? await prisma.stay.findMany({ where: { id: { in: inHouseIds } }, include: stayDetailInclude })
    : [];
  const billing = new Map(
    details.map((d) => {
      const t = computeTotals(d);
      return [d.id, { total: t.total, paid: t.paid, balance: t.balance }];
    })
  );

  res.status(200).json({
    rooms: rooms.map((r) => ({
      ...r,
      stays: r.stays.map((s) => ({ ...s, billing: billing.get(s.id) ?? null })),
    })),
  });
};

export const createRoom = async (req: Request, res: Response) => {
  const data = req.body as CreateRoomInput;
  const establishmentId = await resolveEstablishmentId(req);

  const building = data.building ?? '';
  const exists = await prisma.room.findUnique({
    where: { establishmentId_building_number: { establishmentId, building, number: data.number } },
  });
  if (exists) throw httpError(`La chambre ${data.number}${building ? ` (${building})` : ''} existe déjà`, 409);

  const room = await prisma.room.create({
    data: {
      establishmentId,
      number: data.number,
      building,
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

  const number = data.number ?? existing.number;
  const building = data.building ?? existing.building;
  if (number !== existing.number || building !== existing.building) {
    const taken = await prisma.room.findUnique({
      where: { establishmentId_building_number: { establishmentId: existing.establishmentId, building, number } },
    });
    if (taken) throw httpError(`La chambre ${number}${building ? ` (${building})` : ''} existe déjà`, 409);
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
  const { status, reason } = req.body as { status: 'AVAILABLE' | 'CLEANING' | 'OUT_OF_SERVICE'; reason?: string };
  const room = await assertInScope(() => req.db.room.findFirst({ where: { id } }), 'Chambre introuvable');

  const occupied = await prisma.stay.findFirst({ where: { roomId: id, status: 'CHECKED_IN' } });
  if (occupied) {
    throw httpError(`Chambre occupée par ${occupied.guestName} : enregistrez d’abord son départ`, 409);
  }

  const updated = await prisma.room.update({
    where: { id },
    data:
      status === 'OUT_OF_SERVICE'
        ? { status, outOfServiceReason: reason, outOfServiceAt: new Date() }
        : { status, outOfServiceReason: null, outOfServiceAt: null },
  });
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
    include: {
      room: { select: { id: true, number: true, building: true, category: true } },
      payments: { select: { amount: true } },
      group: { select: { id: true, name: true } },
    },
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
  // Pas de réservation dans le passé (fuseau de l'hôtel : Africa/Libreville)
  if (checkIn < today()) throw httpError('Impossible de réserver à une date passée : l’arrivée doit être aujourd’hui ou plus tard', 400);
  let checkOut = toDay(data.checkOutDate);
  if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);

  if (data.checkInNow) {
    if (room.status === 'OUT_OF_SERVICE') throw httpError('Chambre hors service', 409);
    const occupied = await prisma.stay.findFirst({ where: { roomId: room.id, status: 'CHECKED_IN' } });
    if (occupied) throw httpError(`Chambre occupée par ${occupied.guestName}`, 409);
  }
  await assertRoomFree(room.id, checkIn, checkOut);

  // Client enregistré : commun à tous les établissements du propriétaire
  const customer = data.customerId
    ? await assertInScope(() => req.db.customer.findFirst({ where: { id: data.customerId! } }), 'Client introuvable')
    : null;

  const taxPerNight = await taxFor(room.establishmentId, room.category);

  const stay = await prisma.$transaction(async (tx) => {
    const number = await nextHotelInvoiceNumber(tx, room.establishmentId);
    const created = await tx.stay.create({
      data: {
        establishmentId: room.establishmentId,
        number,
        roomId: room.id,
        customerId: customer?.id ?? null,
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

  if (data.customerId) {
    await assertInScope(() => req.db.customer.findFirst({ where: { id: data.customerId! } }), 'Client introuvable');
  }

  // Séjour en cours : l'arrivée a eu lieu, sa date ne change plus
  const checkIn = existing.status === 'CHECKED_IN' || !data.checkInDate ? existing.checkInDate : toDay(data.checkInDate);
  const checkOut = data.checkOutDate ? toDay(data.checkOutDate) : existing.checkOutDate;
  // Une réservation déplacée ne peut pas l'être dans le passé ; un départ
  // ne peut pas être fixé avant aujourd'hui
  if (existing.status === 'RESERVED' && data.checkInDate && checkIn.getTime() !== existing.checkInDate.getTime() && checkIn < today()) {
    throw httpError('Impossible de réserver à une date passée : l’arrivée doit être aujourd’hui ou plus tard', 400);
  }
  if (data.checkOutDate && checkOut < today()) {
    throw httpError('La date de départ ne peut pas être passée', 400);
  }
  if (checkOut <= checkIn) throw httpError('La date de départ doit être après la date d’arrivée', 400);
  await assertRoomFree(room.id, checkIn, checkOut, existing.id);

  const stay = await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: existing.id },
      data: {
        roomId: room.id,
        customerId: data.customerId,
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

// POST /api/hotel/stays/:id/move { roomId, reason, outOfService } — le client
// change de chambre (anomalie : climatisation, plomberie…). Même facture, même
// tarif ; le motif est noté sur le séjour. En cours de séjour, l'ancienne
// chambre passe à nettoyer, ou hors service avec ce motif si demandé.
export const moveStay = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  const { roomId, reason, outOfService } = req.body as MoveStayInput;
  if (existing.status !== 'RESERVED' && existing.status !== 'CHECKED_IN') {
    throw httpError('Ce séjour est terminé ou annulé : la chambre ne peut plus changer', 409);
  }
  if (roomId === existing.roomId) throw httpError('Choisissez une autre chambre que la chambre actuelle', 400);

  const newRoom = await assertInScope(
    () => req.db.room.findFirst({ where: { id: roomId, isActive: true } }),
    'Chambre introuvable ou retirée de la vente'
  );
  if (newRoom.establishmentId !== existing.establishmentId) throw httpError('La chambre doit être dans le même hôtel', 400);
  if (newRoom.status === 'OUT_OF_SERVICE') throw httpError(`Chambre ${newRoom.number} hors service`, 409);
  if (existing.adults + existing.children > newRoom.capacity) {
    throw httpError(`La chambre ${newRoom.number} accueille ${newRoom.capacity} personne(s) au maximum`, 409);
  }
  if (existing.status === 'CHECKED_IN') {
    const occupied = await prisma.stay.findFirst({ where: { roomId: newRoom.id, status: 'CHECKED_IN' } });
    if (occupied) throw httpError(`Chambre ${newRoom.number} occupée par ${occupied.guestName}`, 409);
  }
  await assertRoomFree(newRoom.id, existing.checkInDate, existing.checkOutDate, existing.id);

  const oldNumber = existing.room.number;
  const mention = `Changement de chambre ${oldNumber} → ${newRoom.number} le ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Libreville' })} : ${reason}`;

  const stay = await prisma.$transaction(async (tx) => {
    await tx.stay.update({
      where: { id: existing.id },
      data: { roomId: newRoom.id, notes: existing.notes ? `${existing.notes}\n${mention}` : mention },
    });
    if (existing.status === 'CHECKED_IN') {
      await tx.room.update({ where: { id: newRoom.id }, data: { status: 'OCCUPIED' } });
    }
    // Ancienne chambre : hors service (avec le motif) si demandé ; sinon, si
    // le client y a dormi, à nettoyer
    if (outOfService) {
      await tx.room.update({
        where: { id: existing.roomId },
        data: { status: 'OUT_OF_SERVICE', outOfServiceReason: reason, outOfServiceAt: new Date() },
      });
    } else if (existing.status === 'CHECKED_IN') {
      await tx.room.update({ where: { id: existing.roomId }, data: { status: 'CLEANING' } });
    }
    return tx.stay.findUniqueOrThrow({ where: { id: existing.id }, include: stayDetailInclude });
  });

  notify(existing.establishmentId);
  res.status(200).json({ stay: withTotals(stay) });
};

// POST /api/hotel/stays/:id/cancel { advance?, cashSessionId? } — réservation
// non honorée ou annulée. Si une avance a été versée, il faut dire ce qu'elle
// devient : remboursée (REFUND) ou conservée comme frais d'annulation (RETAIN).
export const cancelStay = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  if (existing.status !== 'RESERVED') throw httpError('Seule une réservation (avant l’arrivée) peut être annulée', 409);
  const { advance, cashSessionId } = (req.body ?? {}) as CancelStayInput;

  const paid = existing.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  if (paid > 0 && !advance) {
    return res.status(409).json({
      message: `Une avance de ${paid.toLocaleString('fr-FR')} FCFA a été versée : remboursez-la ou conservez-la`,
      code: 'ADVANCE_PAID',
      paid,
    });
  }
  if (advance === 'REFUND' && cashSessionId) await assertUsableCashSession(req, cashSessionId);

  // Montant net encaissé par mode (et par compte client pour « Compte client »)
  const net = new Map<string, { method: AddStayPaymentInput['method']; customerId: string | null; amount: number }>();
  for (const p of existing.payments) {
    const key = `${p.method}:${p.customerId ?? ''}`;
    const entry = net.get(key) ?? { method: p.method as AddStayPaymentInput['method'], customerId: p.customerId, amount: 0 };
    entry.amount += Number(p.amount);
    net.set(key, entry);
  }

  await prisma.$transaction(async (tx) => {
    const mention =
      paid > 0
        ? advance === 'REFUND'
          ? `Annulée : avance de ${paid.toLocaleString('fr-FR')} FCFA remboursée`
          : `Annulée : avance de ${paid.toLocaleString('fr-FR')} FCFA conservée (frais d’annulation)`
        : null;
    await tx.stay.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
        ...(mention ? { notes: existing.notes ? `${existing.notes}\n${mention}` : mention } : {}),
      },
    });

    if (advance !== 'REFUND') return;
    // Remboursement : une ligne négative par mode, le solde du séjour revient à 0
    for (const entry of net.values()) {
      if (entry.amount <= 0) continue;
      await tx.stayPayment.create({
        data: {
          stayId: existing.id,
          method: entry.method,
          amount: -entry.amount,
          note: 'Remboursement de l’avance (annulation)',
          customerId: entry.customerId,
          cashSessionId: cashSessionId ?? null,
          userId: req.user!.id,
        },
      });
      if (entry.method === 'CREDIT' && entry.customerId) {
        await tx.customer.update({ where: { id: entry.customerId }, data: { balance: { decrement: entry.amount } } });
      }
      // Les espèces rendues sortent du tiroir de la personne qui rembourse
      if (entry.method === 'CASH' && cashSessionId) {
        await tx.cashMovement.create({
          data: {
            cashSessionId,
            type: 'REFUND',
            amount: -entry.amount,
            note: `Remboursement avance — chambre ${existing.room.number}, ${existing.guestName}`,
          },
        });
      }
    }
  });
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
    await assertUsableCashSession(req, cashSessionId);
  }

  // Espèces supérieures au reste à payer : on rend la monnaie, seul le dû est
  // enregistré (et entre en caisse) ; le montant remis reste sur le versement
  const due = Math.max(0, withTotals(existing).totals.balance);
  if (method === 'CASH' && due <= 0) throw httpError('La facture est déjà soldée : rien à encaisser', 409);
  const change = method === 'CASH' && amount > due ? Math.round((amount - due) * 100) / 100 : 0;
  const applied = amount - change;

  await prisma.$transaction(async (tx) => {
    await tx.stayPayment.create({
      data: {
        stayId: existing.id,
        method,
        amount: applied,
        note: note || null,
        customerId: creditCustomer?.id ?? null,
        cashSessionId: cashSessionId ?? null,
        ...(change > 0 ? { cashReceived: amount, changeGiven: change } : {}),
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
          amount: applied,
          note: `Séjour chambre ${existing.room.number} — ${existing.guestName}`,
        },
      });
    }
  });

  const stay = await loadStay(req, existing.id);
  notify(existing.establishmentId);
  res.status(201).json({ stay: withTotals(stay) });
};

// GET /api/hotel/in-house — clients en séjour dans TOUS les hôtels du
// propriétaire : le restaurant (même s'il est un autre établissement) peut
// mettre une consommation sur leur chambre
export const listInHouseGuests = async (req: Request, res: Response) => {
  const stays = await prisma.stay.findMany({
    where: { status: 'CHECKED_IN', establishment: { organizationId: req.user!.organizationId } },
    orderBy: [{ establishment: { name: 'asc' } }, { room: { number: 'asc' } }],
    select: {
      id: true,
      guestName: true,
      room: { select: { number: true, building: true } },
      group: { select: { name: true } },
      establishment: { select: { id: true, name: true } },
    },
  });
  res.status(200).json({ stays });
};

// PATCH /api/hotel/stays/:id/discount — remise sur la facture du séjour
// (hors taxe de séjour). Propriétaire / administrateur.
export const setStayDiscount = async (req: Request, res: Response) => {
  const existing = await loadStay(req, req.params.id);
  if (existing.status === 'CANCELLED') throw httpError('Séjour annulé : remise impossible', 409);
  const { mode, value, reason } = req.body as DiscountInput;
  await prisma.stay.update({
    where: { id: existing.id },
    data:
      mode === 'NONE'
        ? { discount: 0, discountRate: null, discountReason: null }
        : mode === 'PERCENT'
          ? { discountRate: value, discountReason: reason || null }
          : { discount: value, discountRate: null, discountReason: reason || null },
  });
  const stay = await loadStay(req, existing.id);
  notify(existing.establishmentId);
  res.status(200).json({ stay: withTotals(stay) });
};

// GET /api/hotel/search?q= — retrouver une facture de l'hôtel : numéro
// (H12, H0012, 12), nom du client ou du groupe. Séjours et groupes.
export const searchHotelInvoices = async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(200).json({ stays: [], groups: [] });
  const { letter, number } = parseInvoiceQuery(q);
  const byNumber = number !== null && (letter === null || letter === 'H');
  const nameFilter = { contains: q, mode: 'insensitive' as const };

  const [stays, groups] = await Promise.all([
    req.db.stay.findMany({
      where: { OR: [...(byNumber ? [{ number }] : []), { guestName: nameFilter }, { customer: { name: nameFilter } }] },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: stayDetailInclude,
    }),
    req.db.stayGroup.findMany({
      where: { OR: [...(byNumber ? [{ number }] : []), { name: nameFilter }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, number: true, name: true, createdAt: true, stays: { select: { status: true } } },
    }),
  ]);

  res.status(200).json({
    stays: stays.map((s) => {
      const t = computeTotals(s);
      return {
        id: s.id,
        number: s.number,
        guestName: s.guestName,
        status: s.status,
        checkInDate: s.checkInDate,
        room: s.room,
        total: t.total,
        balance: t.balance,
      };
    }),
    groups,
  });
};
