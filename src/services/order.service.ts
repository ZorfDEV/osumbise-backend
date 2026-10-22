import { prisma } from '../config/prisma';
import { computeOrderTotals } from './orderTotals';

export const recalculateOrderTotals = async (orderId: string) => {
  const [items, order] = await Promise.all([
    prisma.orderItem.findMany({ where: { orderId } }),
    prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
  ]);

  // Calcul commun au frontend (orderTotals.ts) : prix HT ou prix TTC fixe,
  // remise, TVA et CSS arrondies au franc
  const { subtotal, discount, tax, total } = computeOrderTotals(
    items.map((i) => ({
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      taxRate: Number(i.taxRate),
      cssRate: Number(i.cssRate),
      priceIncludesTax: i.priceIncludesTax,
    })),
    { amount: Number(order.discount), rate: order.discountRate !== null ? Number(order.discountRate) : null }
  );

  return prisma.order.update({
    where: { id: orderId },
    data: { subtotal, discount, tax, total },
  });
};
