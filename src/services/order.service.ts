import { prisma } from '../config/prisma';

export const recalculateOrderTotals = async (orderId: string) => {
  const [items, order] = await Promise.all([
    prisma.orderItem.findMany({ where: { orderId } }),
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
  ]);

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * Number(item.unitPrice),
    0
  );

  // Taxe des produits (taux figé sur chaque ligne), ajoutée au prix hors
  // taxe — arrondie au franc, le FCFA n'ayant pas de centimes
  const tax = Math.round(
    items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice) * (Number(item.taxRate) / 100), 0)
  );

  // Conserve une remise déjà posée sur la commande
  const total = subtotal - Number(order.discount) + tax;

  return prisma.order.update({
    where: { id: orderId },
    data: { subtotal, tax, total },
  });
};
