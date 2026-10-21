import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { assertUsableCashSession } from '../utils/cashSessionAccess';
import { recalculateOrderTotals } from '../services/order.service';
import { payOrder } from '../services/payment.service';
import { PayOrderInput } from '../validators/payment.validator';
import { emitToEstablishment } from '../realtime/socket';
import { getEffectivePrice } from '../utils/productPricing';
import {
  CreateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  UpdateOrderStatusInput,
  VoidOrderItemInput,
  CancelOrderInput,
  DiscountInput,
} from '../validators/order.validator';
import { cancelOrderWithReason, cancelPaidOrder, voidOrderItem } from '../services/orderVoid.service';
import { parseInvoiceQuery } from '../services/stay.service';

// Workflow exact du cahier des charges (section 8), avec ANNULEE comme sortie
// possible depuis n'importe quel statut avant paiement.
// SERVIE -> PAYEE est volontairement ABSENTE d'ici : cette transition implique
// paiement + décrément de stock, elle passera exclusivement par
// /api/orders/:id/pay (prochaine étape), jamais par ce endpoint générique.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  BROUILLON: ['EN_ATTENTE', 'ANNULEE'],
  // SERVIE direct : commande de boissons seules (vérifié dans updateOrderStatus)
  EN_ATTENTE: ['EN_PREPARATION', 'SERVIE', 'ANNULEE'],
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

  // status : un statut ou une liste séparée par des virgules (page « À encaisser »)
  const statuses = status ? (String(status).split(',') as OrderStatus[]) : [];
  const orders = await req.db.order.findMany({
    where: {
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(tableId ? { tableId: tableId as string } : {}),
    },
    include: {
      table: true,
      items: { include: { product: true } },
      user: { select: { name: true } },
      customer: { select: { id: true, name: true, balance: true } },
    },
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
      user: { select: { name: true } },
      establishment: { select: { name: true, type: true, address: true, logo: true, phone: true, email: true, postalBox: true, nif: true, rc: true } },
      customer: { select: { id: true, name: true, balance: true } },
      // Hôtel : consommation mise sur une chambre (affichée sur le ticket)
      stay: { select: { id: true, guestName: true, room: { select: { number: true, building: true } } } },
      voids: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      followsOrder: { select: { id: true, number: true } },
    },
  });

  if (!order) {
    return res.status(404).json({ message: 'Commande introuvable' });
  }

  res.status(200).json({ order });
};

export const createOrder = async (req: Request, res: Response) => {
  const body = req.body as CreateOrderInput;
  const establishmentId = await resolveEstablishmentId(req);

  // Suite d'une facture payée : on reprend sa table et son client
  const previous = body.followsOrderId
    ? await assertInScope(
        () => req.db.order.findFirst({ where: { id: body.followsOrderId } }),
        'Facture précédente introuvable'
      )
    : null;
  if (previous && previous.status !== 'PAYEE' && previous.status !== 'FERMEE') {
    return res.status(409).json({ message: 'La facture précédente n’est pas encore payée : ajoutez les articles à cette commande' });
  }
  const tableId = body.tableId ?? previous?.tableId ?? undefined;
  const customerId = body.customerId ?? previous?.customerId ?? undefined;
  const customerName = body.customerName ?? previous?.customerName ?? undefined;

  if (tableId) {
    await assertInScope(
      () => req.db.diningTable.findFirst({ where: { id: tableId } }),
      'Table introuvable'
    );
  }

  if (customerId) {
    await assertInScope(
      () => req.db.customer.findFirst({ where: { id: customerId } }),
      'Client introuvable'
    );
  }

  const order = await prisma.$transaction(async (tx) => {
    // Numéro de facture : compteur de l'établissement, incrémenté atomiquement
    const counter = await tx.establishment.update({
      where: { id: establishmentId },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true },
    });
    const created = await tx.order.create({
      data: {
        establishmentId,
        number: counter.nextInvoiceNumber - 1,
        followsOrderId: previous?.id ?? null,
        tableId,
        customerName,
        customerId,
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
      // figé au moment de l'ajout, remise en cours (tag) déjà appliquée si active
      unitPrice: getEffectivePrice(product),
      taxRate: product.tva,
      cssRate: product.css,
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

  // Commande sans aucun plat (boissons seules) : servie directement par le
  // serveur, sans passer par la cuisine
  if (status === 'SERVIE' && order.status === 'EN_ATTENTE') {
    const kitchenItems = await prisma.orderItem.count({
      where: { orderId: id, product: { preparationArea: 'KITCHEN' } },
    });
    if (kitchenItems > 0) {
      return res.status(409).json({ message: 'Des plats de cette commande sont encore en cuisine' });
    }
  }

  // Une commande envoyée en cuisine ne s'annule que par POST /:id/cancel
  // (propriétaire/administrateur, avec motif). Seul un brouillon abandonné
  // peut être annulé ici, par n'importe quel membre de la salle.
  if (status === 'ANNULEE' && order.status !== 'BROUILLON') {
    return res.status(403).json({
      message: 'Annulation réservée au propriétaire, avec un motif',
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
  // Numéro et table : la salle annonce « Commande N° 0012 prête — Table T03 »
  emitToEstablishment(order.establishmentId, 'order:status_changed', {
    orderId: id,
    status,
    number: updatedOrder?.number ?? null,
    table: updatedOrder?.table?.label ?? null,
  });
  res.status(200).json({ order: updatedOrder });
};

// POST /api/orders/:id/items/:itemId/void — retirer un article (motif obligatoire)
export const voidOrderItemHandler = async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const { quantity, reason } = req.body as VoidOrderItemInput;
  const order = await assertInScope(() => req.db.order.findFirst({ where: { id } }), 'Commande introuvable');

  const updated = await voidOrderItem({ orderId: id, itemId, quantity, reason, userId: req.user!.id });
  emitToEstablishment(order.establishmentId, 'order:updated', { orderId: id });
  res.status(200).json({ order: updated });
};

// POST /api/orders/:id/cancel — annuler la commande (motif obligatoire)
export const cancelOrderHandler = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, restock } = req.body as CancelOrderInput;
  const order = await assertInScope(() => req.db.order.findFirst({ where: { id } }), 'Commande introuvable');

  // Vente déjà encaissée : annulation avec remise en stock et correction de caisse
  if (order.status === 'PAYEE' || order.status === 'FERMEE') {
    const { closedSessionCash } = await cancelPaidOrder({ orderId: id, reason, userId: req.user!.id, restock: restock ?? true });
    emitToEstablishment(order.establishmentId, 'order:status_changed', { orderId: id, status: 'ANNULEE' });
    return res.status(200).json({ ok: true, closedSessionCash });
  }

  await cancelOrderWithReason({ orderId: id, reason, userId: req.user!.id });
  emitToEstablishment(order.establishmentId, 'order:status_changed', { orderId: id, status: 'ANNULEE' });
  res.status(200).json({ ok: true });
};

// GET /api/orders/voids?from=YYYY-MM-DD&to=YYYY-MM-DD — journal pour les rapports
export const listOrderVoids = async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00`);
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    createdAt.lt = end;
  }
  const voids = await req.db.orderVoid.findMany({
    where: from || to ? { createdAt } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { name: true } },
      order: { select: { id: true, number: true, table: { select: { label: true } }, _count: { select: { payments: true } } } },
    },
  });
  res.status(200).json({ voids });
};

// GET /api/orders/search?q= — retrouver une facture : numéro (12 ou 0012),
// nom du client, table. Toutes les factures, payées ou non (les 30 plus récentes).
export const searchOrders = async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(200).json({ orders: [] });
  // « R0012 », « R12 », « 12 » ; « H… » désigne une facture de l'hôtel (autre recherche)
  const parsed = parseInvoiceQuery(q);
  const asNumber = parsed.number !== null && parsed.letter !== 'H' ? parsed.number : null;
  const orders = await req.db.order.findMany({
    where: {
      items: { some: {} },
      OR: [
        ...(asNumber !== null ? [{ number: asNumber }] : []),
        { customer: { name: { contains: q, mode: 'insensitive' as const } } },
        { customerName: { contains: q, mode: 'insensitive' as const } },
        { table: { label: { equals: q, mode: 'insensitive' as const } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      createdAt: true,
      table: { select: { label: true } },
      customer: { select: { name: true } },
      payments: { select: { method: true } },
    },
  });
  res.status(200).json({ orders });
};

// GET /api/orders/sales?from=YYYY-MM-DD&to=YYYY-MM-DD — ventes encaissées
// (y compris celles annulées après encaissement), par date d'encaissement
export const listSales = async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00`);
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    createdAt.lt = end;
  }
  const orders = await req.db.order.findMany({
    where: {
      status: { in: ['PAYEE', 'FERMEE', 'ANNULEE'] },
      payments: { some: from || to ? { createdAt } : {} },
    },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      updatedAt: true,
      table: { select: { label: true } },
      user: { select: { name: true } },
      customer: { select: { name: true } },
      payments: { select: { method: true, amount: true, createdAt: true } },
      voids: { where: { type: 'ORDER' }, select: { reason: true } },
    },
  });
  res.status(200).json({ orders });
};

// POST /api/orders/:id/pay — seule voie possible vers PAYEE : encaisse,
// décrémente le stock via les recettes, libère la table. Tout ou rien.
export const payOrderHandler = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { payments, cashSessionId, stayId } = req.body as PayOrderInput;

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
    await assertUsableCashSession(req, cashSessionId);
  }

  // Consommation "sur la chambre" : le client doit être en séjour dans un
  // hôtel du même propriétaire (le restaurant de l'hôtel peut être un autre
  // établissement de l'organisation)
  if (stayId) {
    const stay = await prisma.stay.findFirst({
      where: { id: stayId, status: 'CHECKED_IN', establishment: { organizationId: req.user!.organizationId } },
    });
    if (!stay) {
      return res.status(404).json({
        message: 'Séjour introuvable ou terminé : la consommation ne peut pas être mise sur cette chambre',
      });
    }
  }

  const updatedOrder = await payOrder(id, payments, req.user!.id, cashSessionId, stayId);
  emitToEstablishment(order.establishmentId, 'order:paid', { orderId: id });
  res.status(200).json({ order: updatedOrder });
};

// PATCH /api/orders/:id/customer — rattache (ou retire) un client enregistré
// à une commande, depuis l'écran de vente lui-même. Nécessaire pour vendre à
// crédit (voir payment.service.ts, qui refuse un paiement CREDIT sans client
// rattaché).
export const setOrderCustomer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { customerId } = req.body as { customerId: string | null };

  await assertInScope(() => req.db.order.findFirst({ where: { id } }), 'Commande introuvable');

  if (customerId) {
    await assertInScope(
      () => req.db.customer.findFirst({ where: { id: customerId } }),
      'Client introuvable'
    );
  }

  const order = await prisma.order.update({
    where: { id },
    data: { customerId },
    include: { customer: { select: { id: true, name: true, balance: true } } },
  });

  res.status(200).json({ order });
};

// PATCH /api/orders/:id/discount — remise sur la facture (avant ou après
// consommation, tant qu'elle n'est pas payée). Propriétaire / administrateur.
export const setOrderDiscount = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { mode, value, reason } = req.body as DiscountInput;
  const order = await assertInScope(() => req.db.order.findFirst({ where: { id } }), 'Commande introuvable');
  if (['PAYEE', 'FERMEE', 'ANNULEE'].includes(order.status)) {
    return res.status(409).json({ message: 'Facture déjà encaissée ou annulée : remise impossible' });
  }
  await prisma.order.update({
    where: { id },
    data:
      mode === 'NONE'
        ? { discount: 0, discountRate: null, discountReason: null }
        : mode === 'PERCENT'
          ? { discountRate: value, discountReason: reason || null }
          : { discount: value, discountRate: null, discountReason: reason || null },
  });
  const updated = await recalculateOrderTotals(id);
  emitToEstablishment(order.establishmentId, 'order:updated', { orderId: id });
  res.status(200).json({ order: updated });
};
