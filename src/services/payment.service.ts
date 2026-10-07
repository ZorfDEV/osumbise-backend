import { CashMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { applyStockExits } from './stock.service';

interface PaymentInput {
  method: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'TRANSFER' | 'CREDIT';
  amount: number;
}

// TRANSFER et CREDIT sont volontairement absents : ils ne font entrer aucun
// argent dans un tiroir-caisse physique, donc ne génèrent aucun mouvement
const PAYMENT_TO_CASH_MOVEMENT: Partial<Record<PaymentInput['method'], CashMovementType>> = {
  CASH: 'SALE_CASH',
  CARD: 'SALE_CARD',
  MOBILE_MONEY: 'SALE_MOBILE_MONEY',
};

export const payOrder = async (
  orderId: string,
  payments: PaymentInput[],
  userId: string,
  cashSessionId?: string
) => {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: { include: { recipeItems: true } } } } },
  });

  if (order.items.length === 0) {
    throw Object.assign(new Error('Impossible d’encaisser une commande sans articles'), {
      status: 400,
    });
  }

  const creditAmount = payments
    .filter((p) => p.method === 'CREDIT')
    .reduce((sum, p) => sum + p.amount, 0);

  if (creditAmount > 0 && !order.customerId) {
    throw Object.assign(
      new Error('Impossible de vendre à crédit sans client rattaché à la commande'),
      { status: 400 }
    );
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  if (totalPaid < Number(order.total)) {
    throw Object.assign(
      new Error(`Montant insuffisant : ${totalPaid} reçu pour un total de ${order.total}`),
      { status: 400 }
    );
  }

  // Agrège la consommation de stock par ingrédient, tous articles de la
  // commande confondus (ex. deux cocktails différents qui utilisent tous les
  // deux du rhum ne génèrent qu'un seul mouvement de stock pour le rhum).
  // Produit "composé" (a une recette) -> décrément de chaque ingrédient.
  // Produit "simple" (pas de recette déclarée) -> il se consomme lui-même 1-pour-1.
  const consumption = new Map<string, number>();

  for (const item of order.items) {
    const { product } = item;
    if (product.recipeItems.length > 0) {
      for (const recipeItem of product.recipeItems) {
        const qty = Number(recipeItem.quantity) * item.quantity;
        consumption.set(
          recipeItem.ingredientProductId,
          (consumption.get(recipeItem.ingredientProductId) ?? 0) + qty
        );
      }
    } else {
      consumption.set(product.id, (consumption.get(product.id) ?? 0) + item.quantity);
    }
  }

  const exits = Array.from(consumption.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  // Tout réussit ensemble, ou rien n'est appliqué : le décrément de stock, les
  // paiements et le passage à PAYEE sont une seule transaction Postgres —
  // exactement le cas d'usage qui a motivé le choix Prisma/Postgres au départ.
  return prisma.$transaction(async (tx) => {
    await applyStockExits(tx, orderId, exits, userId);

    await tx.payment.createMany({
      data: payments.map((p) => ({ orderId, method: p.method, amount: p.amount })),
    });

    // Vente à crédit : le montant s'ajoute au solde dû du client plutôt que
    // de générer un mouvement de caisse — aucun argent réel n'a encore changé
    // de mains, c'est justement le principe d'un compte client.
    if (creditAmount > 0 && order.customerId) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { balance: { increment: creditAmount } },
      });
    }

    if (cashSessionId) {
      const movementsToCreate: {
        cashSessionId: string;
        type: CashMovementType;
        amount: number;
        orderId: string;
      }[] = [];

      for (const p of payments) {
        const type = PAYMENT_TO_CASH_MOVEMENT[p.method];
        if (type) {
          movementsToCreate.push({ cashSessionId, type, amount: p.amount, orderId });
        }
      }

      if (movementsToCreate.length > 0) {
        await tx.cashMovement.createMany({ data: movementsToCreate });
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { status: 'PAYEE' } });
    await tx.orderStatusHistory.create({ data: { orderId, status: 'PAYEE' } });

    // La table redevient disponible dès l'encaissement, sans attendre le
    // passage administratif à FERMEE
    if (order.tableId) {
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'FREE' } });
    }

    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
  });
};
