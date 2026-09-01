import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { CreateTableInput, UpdateTableStatusInput, UpdateTableInput } from '../validators/table.validator';

export const listTables = async (req: Request, res: Response) => {
  const tables = await req.db.diningTable.findMany({ orderBy: { label: 'asc' } });
  res.status(200).json({ tables });
};

export const createTable = async (req: Request, res: Response) => {
  const { label, zone } = req.body as CreateTableInput;
  const establishmentId = await resolveEstablishmentId(req);

  const table = await prisma.diningTable.create({
    data: { label, zone, establishmentId },
  });

  res.status(201).json({ table });
};

export const updateTableStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as UpdateTableStatusInput;

  await assertInScope(
    () => req.db.diningTable.findFirst({ where: { id } }),
    'Table introuvable'
  );

  const table = await prisma.diningTable.update({ where: { id }, data: { status } });
  res.status(200).json({ table });
};

export const updateTable = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateTableInput;

  await assertInScope(
    () => req.db.diningTable.findFirst({ where: { id } }),
    'Table introuvable'
  );

  const table = await prisma.diningTable.update({ where: { id }, data });
  res.status(200).json({ table });
};

export const deleteTable = async (req: Request, res: Response) => {
  const { id } = req.params;

  const table = await assertInScope(
    () => req.db.diningTable.findFirst({ where: { id } }),
    'Table introuvable'
  );

  if (table.status !== 'FREE') {
    return res.status(409).json({ message: 'Impossible de supprimer une table occupée' });
  }

  // La contrainte de clé étrangère bloquerait de toute façon la suppression si
  // des commandes (même anciennes et clôturées) référencent cette table —
  // autant le vérifier ici pour renvoyer un message clair plutôt qu'une
  // erreur SQL brute
  const orderCount = await prisma.order.count({ where: { tableId: id } });
  if (orderCount > 0) {
    return res.status(409).json({
      message: `Impossible de supprimer : ${orderCount} commande(s) déjà liée(s) à cette table`,
    });
  }

  await prisma.diningTable.delete({ where: { id } });
  res.status(204).send();
};
