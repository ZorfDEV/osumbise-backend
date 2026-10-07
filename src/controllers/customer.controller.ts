import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
  RecordCustomerPaymentInput,
} from '../validators/customer.validator';

export const listCustomers = async (req: Request, res: Response) => {
  const customers = await req.db.customer.findMany({ orderBy: { name: 'asc' } });
  res.status(200).json({ customers });
};

// Relevé de compte : commandes payées à crédit + règlements reçus, pour
// justifier le solde affiché
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

// POST /api/customers/:id/payments — règlement reçu d'un client, réduit son solde
export const recordCustomerPayment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, method, note } = req.body as RecordCustomerPaymentInput;

  const customer = await assertInScope(
    () => req.db.customer.findFirst({ where: { id } }),
    'Client introuvable'
  );

  const [payment] = await prisma.$transaction([
    prisma.customerPayment.create({
      data: { customerId: id, amount, method, note, userId: req.user!.id },
    }),
    prisma.customer.update({
      where: { id },
      data: { balance: Number(customer.balance) - amount },
    }),
  ]);

  res.status(201).json({ payment });
};
