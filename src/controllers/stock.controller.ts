import { Request, Response } from 'express';
import { assertInScope } from '../utils/assertInScope';
import * as stockService from '../services/stock.service';
import { EntryInput, LossInput, AdjustmentInput } from '../validators/stock.validator';

export const createEntry = async (req: Request, res: Response) => {
  const { productId, quantity, reason } = req.body as EntryInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const product = await stockService.recordEntry({
    productId,
    quantity,
    reason,
    userId: req.user!.id,
  });

  res.status(201).json({ product });
};

export const createLoss = async (req: Request, res: Response) => {
  const { productId, quantity, type, reason } = req.body as LossInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const product = await stockService.recordLoss({
    productId,
    quantity,
    type,
    reason,
    userId: req.user!.id,
  });

  res.status(201).json({ product });
};

export const createAdjustment = async (req: Request, res: Response) => {
  const { productId, countedQuantity, reason } = req.body as AdjustmentInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const product = await stockService.recordAdjustment({
    productId,
    countedQuantity,
    reason,
    userId: req.user!.id,
  });

  res.status(201).json({ product });
};

export const listMovements = async (req: Request, res: Response) => {
  const { productId } = req.query;

  const movements = await req.db.stockMovement.findMany({
    where: productId ? { productId: productId as string } : undefined,
    include: {
      product: { select: { name: true, unit: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.status(200).json({ movements });
};

export const listAlerts = async (req: Request, res: Response) => {
  // Prisma ne compare pas deux colonnes entre elles nativement (stockCurrent
  // vs stockMin) dans un `where`. Vu la taille d'un catalogue produits pour
  // un bar/restaurant, filtrer en mémoire après une lecture scopée reste
  // largement suffisant pour le MVP — à revoir avec du SQL brut seulement si
  // le catalogue devient très large.
  const products = await req.db.product.findMany({
    where: { isActive: true },
    include: { category: true },
  });

  const alerts = products
    .filter((p) => Number(p.stockCurrent) <= Number(p.stockMin))
    .map((p) => ({
      ...p,
      severity: Number(p.stockCurrent) <= 0 ? 'RUPTURE' : 'FAIBLE',
    }));

  res.status(200).json({ alerts });
};
