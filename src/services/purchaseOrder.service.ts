import { prisma } from '../config/prisma';
import { applyStockEntries } from './stock.service';

export const recalculatePurchaseOrderTotals = async (purchaseOrderId: string) => {
  const [items, po] = await Promise.all([
    prisma.purchaseItem.findMany({ where: { purchaseOrderId } }),
    prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }),
  ]);

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0
  );
  const total = subtotal - Number(po.discount) + Number(po.tax);

  return prisma.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: { subtotal, total },
  });
};

// Tout ou rien, même principe que payment.service.ts côté ventes : les
// entrées de stock et le passage à RECU sont une seule transaction Postgres
export const receivePurchaseOrder = async (purchaseOrderId: string, userId: string) => {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: purchaseOrderId },
    include: { items: true },
  });

  if (po.status === 'RECU') {
    throw Object.assign(new Error('Cette commande a déjà été reçue'), { status: 409 });
  }
  if (po.status === 'ANNULE') {
    throw Object.assign(new Error('Impossible de recevoir une commande annulée'), {
      status: 409,
    });
  }
  if (po.items.length === 0) {
    throw Object.assign(new Error('Impossible de recevoir une commande sans articles'), {
      status: 400,
    });
  }

  const entries = po.items.map((item) => ({
    productId: item.productId,
    quantity: Number(item.quantity),
  }));

  return prisma.$transaction(async (tx) => {
    await applyStockEntries(tx, purchaseOrderId, entries, userId);

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: 'RECU', receivedAt: new Date() },
    });

    return tx.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      include: { items: { include: { product: true } }, supplier: true },
    });
  });
};
