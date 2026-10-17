import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { CreateCashRegisterInput } from '../validators/cashRegister.validator';

export const listCashRegisters = async (req: Request, res: Response) => {
  const cashRegisters = await req.db.cashRegister.findMany({
    include: {
      sessions: {
        where: { closedAt: null },
        take: 1,
        select: { id: true, openedAt: true, openedById: true, openedBy: { select: { name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.status(200).json({ cashRegisters });
};

export const createCashRegister = async (req: Request, res: Response) => {
  const { name } = req.body as CreateCashRegisterInput;
  const establishmentId = await resolveEstablishmentId(req);

  const cashRegister = await prisma.cashRegister.create({
    data: { name, establishmentId },
  });

  res.status(201).json({ cashRegister });
};
