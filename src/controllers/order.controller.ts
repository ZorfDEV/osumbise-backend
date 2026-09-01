import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { recalculateOrderTotals } from '../services/order.service';
import { payOrder } from '../services/payment.service';
import { PayOrderInput } from '../validators/payment.validator';
import { emitToEstablishment } from '../realtime/socket';
import {
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  UpdateOrderStatusInput,
} from '../validators/order.validator';

// Workflow exact du cahier des charges (section 8), avec ANNULEE comme sortie
// possible depuis n'importe quel statut avant paiement.
// SERVIE -> PAYEE est volontairement ABSENTE d'ici : cette transition implique
// paiement + décrément de stock, elle passera exclusivement par
// /api/orders/:id/pay (prochaine étape), jamais par ce endpoint générique.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  BROUILLON: ['EN_ATTENTE', 'ANNULEE'],
  EN_ATTENTE: ['EN_PREPARATION', 'ANNULEE'],
  EN_PREPARATION: ['PRETE', 'ANNULEE'],
  PRETE: ['SERVIE', 'ANNULEE'],
  SERVIE: ['ANNULEE'],
  PAYEE: ['FERMEE'],
  FERMEE: [],
  ANNULEE: [],
};

// Statuts pendant lesquels les lignes de commande restent modifiables
const EDITABLE_STATUSES: OrderStatus[] = ['BROUILLON', 'EN_ATTENTE'];

export const listOrders = async (req: Request, res: Response) => {
  const { status, tableId } = req.query;

  const orders = await req.db.order.findMany({
    where: {
      ...(status ? { status: status as OrderStatus } : {}),
      ...(tableId ? { tableId: tableId as string } : {}),
    },
    include: { table: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ orders });
};

export const getOrder = async (req: Request, res: Response) => {
  const { id } = req.params;

  const order = await req.db.order.findFirst({
    where: { id },
    include: {
      table: true,
      items: { include: { product: true } },
      payments: true,
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
  });

  if (!order) {
    return res.status(404).json({ message: 'Commande introuvable' });
  }

  res.status(200).json({ order });
};

export const createOrder = async (req: Request, res: Response) => {
  const { tableId, customerName } = req.body as CreateOrderInput;
  const establishmentId = await resolveEstablishmentId(req);

  if (tableId) {
    await assertInScope(
      () => req.db.diningTable.findFirst({ where: { id: tableId } }),
      'Table introuvable'
    );
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        establishmentId,
        tableId,
        customerName,
        userId: req.user!.id,
        status: 'BROUILLON',
      },
    });

    await tx.orderStatusHistory.create({
      data: { orderId: created.id, status: 'BROUILLON' },
    });

    if (tableId) {
      await tx.diningTable.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
    }

    return created;
  });

  emitToEstablishment(establishmentId, 'order:created', {
    orderId: order.id,
    tableId: order.tableId,
  });

  res.status(201).json({ order });
};

export const addOrderItem = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { productId, quantity, note } = req.body as AddOrderItemInput;

  const order = await assertInScope(
    () => req.db.order.findFirst({ where: { id } }),
    'Commande introuvable'
  );

  if (!EDITABLE_STATUSES.includes(order.status)) {
    return res.status(409).json({ message: 'Impossible de modifier une commande à ce stade' });
  }

  const product = await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId, isActive: true } }),
    'Produit introuvable ou inactif'
  );

  await prisma.orderItem.create({
    data: {
      orderId: id,
      productId,
      quantity,
      unitPrice: product.sellingPrice, // figé au moment de l'ajout
      note,
    },
  });

  const updatedOrder = await recalculateOrderTotals(id);
  emitToEstablishment(order.establishmentId, 'order:updated', { orderId: id });
  res.status(201).json({ order: updatedOrder });
};

export const updateOrderItem = async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const { quantity } = req.body as UpdateOrderItemInput;

  const order = await assertInScope(
    () => req.db.order.findFirst({ where: { id } }),
    'Commande introuvable'
  );

  if (!EDITABLE_STATUSES.includes(order.status)) {
    return res.status(409).json({ message: 'Impossible de modifier une commande à ce stade' });
  }

  const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId: id } });
  if (!item) {
    return res.status(404).json({ message: 'Ligne de commande introuvable' });
  }

  await prisma.orderItem.update({ where: { id: itemId }, data: { quantity } });

  const updatedOrder = await recalculateOrderTotals(id);
  emitToEstablishment(order.establishmentId, 'order:updated', { orderId: id });
  res.status(200).json({ order: updatedOrder });
};

export const removeOrderItem = async (req: Request, res: Response) => {
  const { id, itemId } = req.params;

  const order = await assertInScope(
    () => req.db.order.findFirst({ where: { id } }),
    'Commande introuvable'
  );

  if (!EDITABLE_STATUSES.includes(order.status)) {
    return res.status(409).json({ message: 'Impossible de modifier une commande à ce stade' });
  }

  const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId: id } });
  if (!item) {
    return res.status(404).json({ message: 'Ligne de commande introuvable' });
  }

  await prisma.orderItem.delete({ where: { id: itemId } });

  const updatedOrder = await recalculateOrderTotals(id);
  emitToEstablishment(order.establishmentId, 'order:updated', { orderId: id });
  res.status(200).json({ order: updatedOrder });
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as UpdateOrderStatusInput;

  const order = await assertInScope(
    () => req.db.order.findFirst({ where: { id } }),
    'Commande introuvable'
  );

  const allowed = ALLOWED_TRANSITIONS[order.status];
  if (!allowed.includes(status)) {
    return res.status(409).json({
      message: `Transition invalide : ${order.status} → ${status}`,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { status } });
    await tx.orderStatusHistory.create({ data: { orderId: id, status } });

    // Table libérée à la fermeture ou à l'annulation
    if ((status === 'FERMEE' || status === 'ANNULEE') && order.tableId) {
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'FREE' } });
    }
  });

  const updatedOrder = await prisma.order.findUnique({ where: { id }, include: { table: true } });
  emitToEstablishment(order.establishmentId, 'order:status_changed', { orderId: id, status });
  res.status(200).json({ order: updatedOrder });
};

// POST /api/orders/:id/pay — seule voie possible vers PAYEE : encaisse,
// décrémente le stock via les recettes, libère la table. Tout ou rien.
export const payOrderHandler = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { payments, cashSessionId } = req.body as PayOrderInput;

  const order = await assertInScope(
    () => req.db.order.findFirst({ where: { id } }),
    'Commande introuvable'
  );

  if (order.status !== 'SERVIE') {
    return res.status(409).json({
      message: `Impossible d'encaisser une commande au statut ${order.status} (doit être SERVIE)`,
    });
  }

  if (cashSessionId) {
    await assertInScope(
      () => req.db.cashSession.findFirst({ where: { id: cashSessionId, closedAt: null } }),
      'Session de caisse invalide, introuvable ou déjà clôturée'
    );
  }

  const updatedOrder = await payOrder(id, payments, req.user!.id, cashSessionId);
  emitToEstablishment(order.establishmentId, 'order:paid', { orderId: id });
  res.status(200).json({ order: updatedOrder });
};
