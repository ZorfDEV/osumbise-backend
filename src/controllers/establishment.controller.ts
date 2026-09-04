import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import {
  CreateEstablishmentInput,
  UpdateEstablishmentInput,
} from '../validators/establishment.validator';

export const listEstablishments = async (req: Request, res: Response) => {
  // Scopé par organizationId — un OWNER voit tous les établissements de son
  // organisation, les autres rôles ne verraient (via req.db) que le leur
  const establishments = await req.db.establishment.findMany({
    orderBy: { name: 'asc' },
  });
  res.status(200).json({ establishments });
};

export const createEstablishment = async (req: Request, res: Response) => {
  const { name, type, address, logo } = req.body as CreateEstablishmentInput;

  // Pas besoin de resolveEstablishmentId ici : un établissement est rattaché
  // directement à l'organisation, pas à un autre établissement
  const establishment = await prisma.establishment.create({
    data: {
      name,
      type,
      address,
      logo,
      organizationId: req.user!.organizationId,
    },
  });

  res.status(201).json({ establishment });
};

export const updateEstablishment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateEstablishmentInput;

  const existing = await req.db.establishment.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Établissement introuvable' });
  }

  const establishment = await prisma.establishment.update({ where: { id }, data });
  res.status(200).json({ establishment });
};
