import { Request, Response } from 'express';
import { CashMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { assertUsableCashSession } from '../utils/cashSessionAccess';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  RecordCustomerPaymentInput,
} from '../validators/customer.validator';

export const listCustomers = async (req: Request, res: Response) => {
  const customers = await req.db.customer.findMany({
    orderBy: { name: 'asc' },
    // Établissement où le compte a été créé (comptes partagés entre établissements)
    include: { establishment: { select: { id: true, name: true } } },
  });
  res.status(200).json({ customers });
};

// Relevé de compte : commandes payées à crédit, séjours mis sur le compte et
// règlements reçus, pour justifier le solde affiché
export const getCustomer = async (req: Request, res: Response) => {
  const { id } = req.params;

  const customer = await req.db.customer.findFirst({
    where: { id },
    include: {
      orders: {
        where: { status: { in: ['PAYEE', 'FERMEE'] } },
        include: { payments: { where: { method: 'CREDIT' } }, establishment: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 30 },
      stayPayments: {
        where: { method: 'CREDIT' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { stay: { select: { id: true, guestName: true, room: { select: { number: true, building: true } } } } },
      },
      // Historique des séjours rattachés à ce client
      stays: {
        orderBy: { checkInDate: 'desc' },
        take: 30,
        select: {
          id: true,
          guestName: true,
          status: true,
          checkInDate: true,
          checkOutDate: true,
          room: { select: { number: true, building: true } },
          establishment: { select: { name: true } },
        },
      },
    },
  });

  if (!customer) {
    return res.status(404).json({ message: 'Client introuvable' });
  }

  // En-tête du relevé imprimé : l'établissement de la personne connectée
  // (à défaut, celui où le compte a été créé)
  const issuer = await prisma.establishment.findUnique({
    where: { id: req.user!.establishmentId ?? customer.establishmentId },
    select: { name: true, address: true, logo: true, phone: true, email: true, postalBox: true, nif: true, rc: true },
  });

  res.status(200).json({ customer: { ...customer, issuer } });
};

export const createCustomer = async (req: Request, res: Response) => {
  const { name, phone, address, creditLimit } = req.body as CreateCustomerInput;
  const establishmentId = await resolveEstablishmentId(req);

  const customer = await prisma.customer.create({
    data: { name, phone, address, creditLimit, establishmentId },
  });

  res.status(201).json({ customer });
};

export const updateCustomer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateCustomerInput;

  await assertInScope(() => req.db.customer.findFirst({ where: { id } }), 'Client introuvable');

  const customer = await prisma.customer.update({ where: { id }, data });
  res.status(200).json({ customer });
};

const PAYMENT_TO_CASH_MOVEMENT: Partial<Record<RecordCustomerPaymentInput['method'], CashMovementType>> = {
  CASH: 'SALE_CASH',
  CARD: 'SALE_CARD',
  MOBILE_MONEY: 'SALE_MOBILE_MONEY',
};

// POST /api/customers/:id/payments — règlement reçu d'un client, réduit son solde
// (et entre dans la caisse ouverte, comme une vente, pour que le comptage tombe juste)
export const recordCustomerPayment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, method, note, cashSessionId } = req.body as RecordCustomerPaymentInput;

  const customer = await assertInScope(
    () => req.db.customer.findFirst({ where: { id } }),
    'Client introuvable'
  );

  if (cashSessionId) {
    await assertUsableCashSession(req, cashSessionId);
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.customerPayment.create({
      data: { customerId: id, amount, method, note, userId: req.user!.id },
    });
    await tx.customer.update({ where: { id }, data: { balance: { decrement: amount } } });
    const movementType = PAYMENT_TO_CASH_MOVEMENT[method];
    if (cashSessionId && movementType) {
      await tx.cashMovement.create({
        data: { cashSessionId, type: movementType, amount, note: `Règlement compte client — ${customer.name}` },
      });
    }
    return created;
  });

  res.status(201).json({ payment });
};
