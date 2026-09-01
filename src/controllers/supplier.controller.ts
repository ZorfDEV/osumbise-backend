import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { CreateSupplierInput, UpdateSupplierInput } from '../validators/supplier.validator';

export const listSuppliers = async (req: Request, res: Response) => {
  const suppliers = await req.db.supplier.findMany({ orderBy: { name: 'asc' } });
  res.status(200).json({ suppliers });
};

export const getSupplier = async (req: Request, res: Response) => {
  const { id } = req.params;

  const supplier = await req.db.supplier.findFirst({
    where: { id },
    include: {
      // Historique d'achats (correspond à "Historique achats" de la fiche
      // fournisseur, section 17 du document)
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!supplier) {
    return res.status(404).json({ message: 'Fournisseur introuvable' });
  }

  res.status(200).json({ supplier });
};

export const createSupplier = async (req: Request, res: Response) => {
  const { name, phone, email, address } = req.body as CreateSupplierInput;
  const establishmentId = await resolveEstablishmentId(req);

  const supplier = await prisma.supplier.create({
    data: { name, phone, email, address, establishmentId },
  });

  res.status(201).json({ supplier });
};

export const updateSupplier = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateSupplierInput;

  await assertInScope(
    () => req.db.supplier.findFirst({ where: { id } }),
    'Fournisseur introuvable'
  );

  const supplier = await prisma.supplier.update({ where: { id }, data });
  res.status(200).json({ supplier });
};

export const deleteSupplier = async (req: Request, res: Response) => {
  const { id } = req.params;

  await assertInScope(
    () => req.db.supplier.findFirst({ where: { id } }),
    'Fournisseur introuvable'
  );

  const orderCount = await prisma.purchaseOrder.count({ where: { supplierId: id } });
  if (orderCount > 0) {
    return res.status(409).json({
      message: `Impossible de supprimer : ${orderCount} commande(s) d'achat déjà liée(s) à ce fournisseur`,
    });
  }

  await prisma.supplier.delete({ where: { id } });
  res.status(204).send();
};
