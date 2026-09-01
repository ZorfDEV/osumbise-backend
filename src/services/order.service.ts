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

  // Conserve une remise/taxe déjà posée sur la commande (pas encore de endpoint
  // dédié pour les définir dans ce MVP, mais le calcul est prêt à les recevoir)
  const total = subtotal - Number(order.discount) + Number(order.tax);

  return prisma.order.update({
    where: { id: orderId },
    data: { subtotal, total },
  });
};
