import { Request, Response } from 'express';
import { assertInScope } from '../utils/assertInScope';
import * as stockService from '../services/stock.service';
import { EntryInput, LossInput, AdjustmentInput, TransferInput, CorrectionInput } from '../validators/stock.validator';

export const createEntry = async (req: Request, res: Response) => {
  const { productId, quantity, reason, location } = req.body as EntryInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const product = await stockService.recordEntry({
    productId,
    quantity,
    location,
    reason,
    userId: req.user!.id,
  });

  res.status(201).json({ product });
};

export const createLoss = async (req: Request, res: Response) => {
  const { productId, quantity, type, reason, location } = req.body as LossInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const product = await stockService.recordLoss({
    productId,
    quantity,
    type,
    location,
    reason,
    userId: req.user!.id,
  });

  res.status(201).json({ product });
};

export const createAdjustment = async (req: Request, res: Response) => {
  const { productId, countedQuantity, reason, location } = req.body as AdjustmentInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const product = await stockService.recordAdjustment({
    productId,
    countedQuantity,
    location,
    reason,
    userId: req.user!.id,
  });

  res.status(201).json({ product });
};

// POST /api/stock/transfer — déstockage réserve → vente (ou retour)
export const createTransfer = async (req: Request, res: Response) => {
  const { productId, quantity, direction, reason } = req.body as TransferInput;
  await assertInScope(() => req.db.product.findFirst({ where: { id: productId } }), 'Produit introuvable');
  const product = await stockService.recordTransfer({ productId, quantity, direction, reason, userId: req.user!.id });
  res.status(201).json({ product });
};

// POST /api/stock/movements/:id/correct — corriger une entrée erronée
export const correctMovement = async (req: Request, res: Response) => {
  const { quantity, reason } = req.body as CorrectionInput;
  await assertInScope(() => req.db.stockMovement.findFirst({ where: { id: req.params.id } }), 'Mouvement introuvable');
  const product = await stockService.correctEntry({ movementId: req.params.id, quantity, reason, userId: req.user!.id });
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

  const corrected = new Set(
    (
      await req.db.stockMovement.findMany({
        where: { correctsMovementId: { in: movements.map((m) => m.id) } },
        select: { correctsMovementId: true },
      })
    ).map((m) => m.correctsMovementId)
  );

  res.status(200).json({ movements: movements.map((m) => ({ ...m, corrected: corrected.has(m.id) })) });
};

export const listAlerts = async (req: Request, res: Response) => {
  // Prisma ne compare pas deux colonnes entre elles nativement (stockCurrent
  // vs stockMin) dans un `where`. Vu la taille d'un catalogue produits pour
  // un bar/restaurant, filtrer en mémoire après une lecture scopée reste
  // largement suffisant pour le MVP — à revoir avec du SQL brut seulement si
  // le catalogue devient très large.
  // Les plats composés (avec recette) sont préparés à la commande, pas
  // stockés : seuls les produits du stock principal (ingrédients, articles
  // simples) déclenchent une alerte
  const products = await req.db.product.findMany({
    where: { isActive: true, recipeItems: { none: {} } },
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
