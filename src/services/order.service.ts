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

  // TVA et CSS des produits (taux figés sur chaque ligne), ajoutées au prix
  // hors taxe. Chaque taxe est calculée par taux sur la base HT des articles
  // concernés, arrondie au franc (le FCFA n'a pas de centimes) — même calcul
  // que l'affichage de la facture (frontend : features/pos/taxes.ts)
  // Remise : % recalculé sur le sous-total, ou montant fixe plafonné ; les
  // taxes portent sur le HT après remise (bases réduites au prorata)
  const discount = order.discountRate !== null
    ? Math.round((subtotal * Number(order.discountRate)) / 100)
    : Math.min(Number(order.discount), subtotal);
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 1;

  const bases = new Map<string, number>();
  for (const item of items) {
    const base = item.quantity * Number(item.unitPrice) * ratio;
    for (const [kind, rate] of [['TVA', Number(item.taxRate)], ['CSS', Number(item.cssRate)]] as const) {
      if (rate) bases.set(`${kind}-${rate}`, (bases.get(`${kind}-${rate}`) ?? 0) + base);
    }
  }
  const tax = [...bases.entries()].reduce(
    (sum, [key, base]) => sum + Math.round((base * Number(key.split('-')[1])) / 100),
    0
  );

  const total = subtotal - discount + tax;

  return prisma.order.update({
    where: { id: orderId },
    data: { subtotal, discount, tax, total },
  });
};
