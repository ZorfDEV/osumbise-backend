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
  const customers = await req.db.customer.findMany({ orderBy: { name: 'asc' } });
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
        include: { payments: { where: { method: 'CREDIT' } } },
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
    },
  });

  if (!customer) {
    return res.status(404).json({ message: 'Client introuvable' });
  }

  res.status(200).json({ customer });
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
