import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { CreateCashRegisterInput, LockCashRegisterInput } from '../validators/cashRegister.validator';

export const listCashRegisters = async (req: Request, res: Response) => {
  const cashRegisters = await req.db.cashRegister.findMany({
    include: {
      sessions: {
        where: { closedAt: null },
        take: 1,
        select: { id: true, openedAt: true, plannedCloseAt: true, openedById: true, openedBy: { select: { name: true } } },
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

// PATCH /api/cash-registers/:id/lock { locked, reason? } — propriétaire : une
// caisse verrouillée n'accepte plus aucune ouverture de session
export const lockCashRegister = async (req: Request, res: Response) => {
  const { locked, reason } = req.body as LockCashRegisterInput;
  const register = await req.db.cashRegister.findFirst({
    where: { id: req.params.id },
    include: { sessions: { where: { closedAt: null }, take: 1, include: { openedBy: { select: { name: true } } } } },
  });
  if (!register) return res.status(404).json({ message: 'Caisse introuvable' });
  if (locked && register.sessions.length > 0) {
    return res.status(409).json({
      message: `Une session est ouverte par ${register.sessions[0].openedBy.name} : elle doit être clôturée avant de verrouiller la caisse`,
    });
  }
  const updated = await prisma.cashRegister.update({
    where: { id: register.id },
    data: locked
      ? { isLocked: true, lockedReason: reason || null, lockedAt: new Date() }
      : { isLocked: false, lockedReason: null, lockedAt: null },
  });
  res.status(200).json({ cashRegister: updated });
};
