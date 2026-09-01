import { Request, Response } from 'express';
import { PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import {
  recalculatePurchaseOrderTotals,
  receivePurchaseOrder,
} from '../services/purchaseOrder.service';
import {
  CreatePurchaseOrderInput,
  AddPurchaseItemInput,
  UpdatePurchaseItemInput,
  UpdatePurchaseOrderStatusInput,
} from '../validators/purchaseOrder.validator';

const ALLOWED_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  BROUILLON: ['COMMANDE', 'ANNULE'],
  COMMANDE: ['ANNULE'],
  RECU: [],
  ANNULE: [],
};

const EDITABLE_STATUSES: PurchaseOrderStatus[] = ['BROUILLON'];

export const listPurchaseOrders = async (req: Request, res: Response) => {
  const { status, supplierId } = req.query;

  const purchaseOrders = await req.db.purchaseOrder.findMany({
    where: {
      ...(status ? { status: status as PurchaseOrderStatus } : {}),
      ...(supplierId ? { supplierId: supplierId as string } : {}),
    },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ purchaseOrders });
};

export const getPurchaseOrder = async (req: Request, res: Response) => {
  const { id } = req.params;

  const purchaseOrder = await req.db.purchaseOrder.findFirst({
    where: { id },
    include: { supplier: true, items: { include: { product: true } } },
  });

  if (!purchaseOrder) {
    return res.status(404).json({ message: "Commande d'achat introuvable" });
  }

  res.status(200).json({ purchaseOrder });
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
  const { supplierId } = req.body as CreatePurchaseOrderInput;
  const establishmentId = await resolveEstablishmentId(req);

  await assertInScope(
    () => req.db.supplier.findFirst({ where: { id: supplierId } }),
    'Fournisseur introuvable'
  );

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: { establishmentId, supplierId, userId: req.user!.id, status: 'BROUILLON' },
  });

  res.status(201).json({ purchaseOrder });
};

export const addPurchaseItem = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { productId, quantity, unitPrice } = req.body as AddPurchaseItemInput;

  const po = await assertInScope(
    () => req.db.purchaseOrder.findFirst({ where: { id } }),
    "Commande d'achat introuvable"
  );

  if (!EDITABLE_STATUSES.includes(po.status)) {
    return res.status(409).json({ message: 'Impossible de modifier cette commande à ce stade' });
  }

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  await prisma.purchaseItem.create({
    data: { purchaseOrderId: id, productId, quantity, unitPrice },
  });

  const updated = await recalculatePurchaseOrderTotals(id);
  res.status(201).json({ purchaseOrder: updated });
};

export const updatePurchaseItem = async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const data = req.body as UpdatePurchaseItemInput;

  const po = await assertInScope(
    () => req.db.purchaseOrder.findFirst({ where: { id } }),
    "Commande d'achat introuvable"
  );

  if (!EDITABLE_STATUSES.includes(po.status)) {
    return res.status(409).json({ message: 'Impossible de modifier cette commande à ce stade' });
  }

  const item = await prisma.purchaseItem.findFirst({
    where: { id: itemId, purchaseOrderId: id },
  });
  if (!item) {
    return res.status(404).json({ message: 'Ligne introuvable' });
  }

  await prisma.purchaseItem.update({ where: { id: itemId }, data });

  const updated = await recalculatePurchaseOrderTotals(id);
  res.status(200).json({ purchaseOrder: updated });
};

export const removePurchaseItem = async (req: Request, res: Response) => {
  const { id, itemId } = req.params;

  const po = await assertInScope(
    () => req.db.purchaseOrder.findFirst({ where: { id } }),
    "Commande d'achat introuvable"
  );

  if (!EDITABLE_STATUSES.includes(po.status)) {
    return res.status(409).json({ message: 'Impossible de modifier cette commande à ce stade' });
  }

  const item = await prisma.purchaseItem.findFirst({
    where: { id: itemId, purchaseOrderId: id },
  });
  if (!item) {
    return res.status(404).json({ message: 'Ligne introuvable' });
  }

  await prisma.purchaseItem.delete({ where: { id: itemId } });

  const updated = await recalculatePurchaseOrderTotals(id);
  res.status(200).json({ purchaseOrder: updated });
};

export const updatePurchaseOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as UpdatePurchaseOrderStatusInput;

  const po = await assertInScope(
    () => req.db.purchaseOrder.findFirst({ where: { id } }),
    "Commande d'achat introuvable"
  );

  const allowed = ALLOWED_TRANSITIONS[po.status];
  if (!allowed.includes(status)) {
    return res.status(409).json({ message: `Transition invalide : ${po.status} → ${status}` });
  }

  const purchaseOrder = await prisma.purchaseOrder.update({ where: { id }, data: { status } });
  res.status(200).json({ purchaseOrder });
};

// POST /api/purchase-orders/:id/receive — seule voie possible vers RECU :
// génère les entrées de stock. Tout ou rien.
export const receivePurchaseOrderHandler = async (req: Request, res: Response) => {
  const { id } = req.params;

  const po = await assertInScope(
    () => req.db.purchaseOrder.findFirst({ where: { id } }),
    "Commande d'achat introuvable"
  );

  if (po.status !== 'COMMANDE') {
    return res.status(409).json({
      message: `Impossible de recevoir une commande au statut ${po.status} (doit être COMMANDE)`,
    });
  }

  const purchaseOrder = await receivePurchaseOrder(id, req.user!.id);
  res.status(200).json({ purchaseOrder });
};
