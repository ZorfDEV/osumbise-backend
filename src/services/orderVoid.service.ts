import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { recalculateOrderTotals } from './order.service';

// Annulation d'une commande ou retrait d'un article après envoi en cuisine
// (« le plat ne m'a pas plu ») : réservé au propriétaire et à l'administrateur,
// toujours avec un motif, et tracé dans le journal OrderVoid.
//
// Stock : il n'est normalement décrémenté qu'à l'encaissement. Si le plat a
// déjà été préparé (commande passée en préparation ou au-delà), les
// ingrédients sont bel et bien consommés : on les sort du stock en PERTE,
// pour que l'inventaire reste juste.

const PREPARED_STATUSES: OrderStatus[] = ['EN_PREPARATION', 'PRETE', 'SERVIE'];
const CLOSED_STATUSES: OrderStatus[] = ['PAYEE', 'FERMEE', 'ANNULEE'];

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

type ItemWithRecipe = Prisma.OrderItemGetPayload<{ include: { product: { include: { recipeItems: true } } } }>;

// Consommation par produit de stock (recette, ou le produit lui-même)
const consumptionOf = (lines: { item: ItemWithRecipe; quantity: number }[]) => {
  const map = new Map<string, number>();
  for (const { item, quantity } of lines) {
    const { product } = item;
    if (product.recipeItems.length > 0) {
      for (const r of product.recipeItems) {
        map.set(r.ingredientProductId, (map.get(r.ingredientProductId) ?? 0) + Number(r.quantity) * quantity);
      }
    } else {
      map.set(product.id, (map.get(product.id) ?? 0) + quantity);
    }
  }
  return map;
};

// Sortie en perte, sans jamais bloquer l'annulation : si le stock théorique
// est déjà insuffisant, on ne sort que ce qui reste
const recordPreparedLoss = async (
  tx: Prisma.TransactionClient,
  orderId: string,
  consumption: Map<string, number>,
  reason: string,
  userId: string
) => {
  for (const [productId, wanted] of consumption) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const before = Number(product.stockCurrent);
    const quantity = Math.min(wanted, Math.max(0, before));
    if (quantity <= 0) continue;
    await tx.product.update({ where: { id: productId }, data: { stockCurrent: { decrement: quantity } } });
    await tx.stockMovement.create({
      data: { productId, type: 'PERTE', quantity, stockBefore: before, stockAfter: before - quantity, orderId, reason, userId },
    });
  }
};

const loadOrder = (orderId: string) =>
  prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: { include: { recipeItems: true } } } } },
  });

// Retirer tout ou partie d'une ligne
export const voidOrderItem = async (params: {
  orderId: string;
  itemId: string;
  quantity: number;
  reason: string;
  userId: string;
}) => {
  const order = await loadOrder(params.orderId);
  if (CLOSED_STATUSES.includes(order.status)) {
    throw httpError('Commande déjà encaissée, fermée ou annulée : article non modifiable', 409);
  }
  const item = order.items.find((i) => i.id === params.itemId);
  if (!item) throw httpError('Ligne de commande introuvable', 404);
  if (params.quantity > item.quantity) {
    throw httpError(`Quantité trop élevée : ${item.quantity} sur cette ligne`, 400);
  }

  const wasPrepared = PREPARED_STATUSES.includes(order.status);
  await prisma.$transaction(async (tx) => {
    if (params.quantity === item.quantity) {
      await tx.orderItem.delete({ where: { id: item.id } });
    } else {
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity - params.quantity } });
    }
    await tx.orderVoid.create({
      data: {
        orderId: order.id,
        type: 'ITEM',
        productName: item.product.name,
        quantity: params.quantity,
        // Montant non facturé, taxe comprise
        amount: item.priceIncludesTax
          ? Math.round(Number(item.unitPrice) * params.quantity)
          : Math.round(Number(item.unitPrice) * params.quantity * (1 + (Number(item.taxRate) + Number(item.cssRate)) / 100)),
        reason: params.reason,
        wasPrepared,
        userId: params.userId,
      },
    });
    if (wasPrepared) {
      await recordPreparedLoss(
        tx,
        order.id,
        consumptionOf([{ item, quantity: params.quantity }]),
        `Retiré de la commande : ${params.reason}`,
        params.userId
      );
    }
  });

  return recalculateOrderTotals(order.id);
};

// Annuler toute la commande (le client ne paie pas)
export const cancelOrderWithReason = async (params: { orderId: string; reason: string; userId: string }) => {
  const order = await loadOrder(params.orderId);
  if (CLOSED_STATUSES.includes(order.status)) {
    throw httpError('Commande déjà encaissée, fermée ou annulée', 409);
  }

  const wasPrepared = PREPARED_STATUSES.includes(order.status);
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'ANNULEE' } });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'ANNULEE' } });
    if (order.tableId) {
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'FREE' } });
    }
    await tx.orderVoid.create({
      data: {
        orderId: order.id,
        type: 'ORDER',
        amount: Number(order.total),
        reason: params.reason,
        wasPrepared,
        userId: params.userId,
      },
    });
    if (wasPrepared && order.items.length > 0) {
      await recordPreparedLoss(
        tx,
        order.id,
        consumptionOf(order.items.map((item) => ({ item, quantity: item.quantity }))),
        `Commande annulée : ${params.reason}`,
        params.userId
      );
    }
  });

  return order;
};

// Annuler une vente DÉJÀ ENCAISSÉE (commande de test, remboursement) :
// la commande passe en ANNULEE et sort donc des rapports, du tableau de bord,
// du relevé client et de la note de chambre (tous ne comptent que PAYEE/FERMEE).
// On défait ensuite ce que l'encaissement avait produit :
// - stock : les sorties de vente sont remises en stock (si restock) ;
// - caisse : les espèces encaissées sont sorties (REFUND) de leur session si
//   elle est encore ouverte — une session clôturée n'est jamais modifiée ;
// - compte client : la part « compte client » est retirée du solde dû.
export const cancelPaidOrder = async (params: {
  orderId: string;
  reason: string;
  userId: string;
  restock: boolean;
}) => {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: params.orderId },
    include: {
      payments: true,
      stockMovements: { where: { type: 'SORTIE_VENTE' } },
      cashMovements: { include: { cashSession: { select: { id: true, closedAt: true } } } },
    },
  });
  if (order.status !== 'PAYEE' && order.status !== 'FERMEE') {
    throw httpError('Seule une vente encaissée peut être annulée ici', 409);
  }

  const cashBySession = new Map<string, number>();
  let closedSessionCash = 0;
  for (const m of order.cashMovements) {
    if (m.type !== 'SALE_CASH') continue;
    if (m.cashSession.closedAt) closedSessionCash += Number(m.amount);
    else cashBySession.set(m.cashSessionId, (cashBySession.get(m.cashSessionId) ?? 0) + Number(m.amount));
  }
  const creditAmount = order.payments
    .filter((p) => p.method === 'CREDIT')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: 'ANNULEE' } });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'ANNULEE' } });
    await tx.orderVoid.create({
      data: {
        orderId: order.id,
        type: 'ORDER',
        amount: Number(order.total),
        reason: params.reason,
        wasPrepared: false,
        userId: params.userId,
      },
    });

    if (params.restock) {
      for (const m of order.stockMovements) {
        const product = await tx.product.update({
          where: { id: m.productId },
          data: { stockCurrent: { increment: m.quantity } },
        });
        const after = Number(product.stockCurrent);
        await tx.stockMovement.create({
          data: {
            productId: m.productId,
            type: 'ENTREE',
            quantity: m.quantity,
            stockBefore: after - Number(m.quantity),
            stockAfter: after,
            orderId: order.id,
            reason: `Vente annulée : ${params.reason}`,
            userId: params.userId,
          },
        });
      }
    }

    for (const [cashSessionId, amount] of cashBySession) {
      await tx.cashMovement.create({
        data: { cashSessionId, type: 'REFUND', amount: -amount, orderId: order.id, note: `Vente annulée : ${params.reason}` },
      });
    }

    if (creditAmount > 0 && order.customerId) {
      await tx.customer.update({ where: { id: order.customerId }, data: { balance: { decrement: creditAmount } } });
    }
  });

  return { order, closedSessionCash };
};
