import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';

interface ApplyDeltaParams {
  tx: Prisma.TransactionClient;
  productId: string;
  delta: number; // signé : positif = entrée, négatif = sortie
  type: StockMovementType;
  orderId?: string;
  purchaseOrderId?: string;
  reason?: string;
  userId?: string;
}

const applyDelta = async ({
  tx,
  productId,
  delta,
  type,
  orderId,
  purchaseOrderId,
  reason,
  userId,
}: ApplyDeltaParams) => {
  if (delta === 0) {
    throw Object.assign(new Error('La quantité ne peut pas être nulle'), { status: 400 });
  }

  // Update atomique en base : stock_current = stock_current + delta.
  // Postgres garantit qu'aucun mouvement simultané sur ce produit (deux ventes
  // en même temps, par exemple) ne peut créer d'incohérence, sans verrou explicite.
  const product = await tx.product.update({
    where: { id: productId },
    data: { stockCurrent: { increment: delta } },
  });

  const stockAfter = Number(product.stockCurrent);
  const stockBefore = stockAfter - delta;

  if (stockAfter < 0) {
    // Lever ici annule tout le $transaction englobant, y compris l'update
    // qu'on vient de faire — le stock n'est jamais laissé négatif en base
    throw Object.assign(
      new Error(`Stock insuffisant pour "${product.name}" (disponible : ${stockBefore})`),
      { status: 409 }
    );
  }

  await tx.stockMovement.create({
    data: {
      productId,
      type,
      quantity: Math.abs(delta),
      stockBefore,
      stockAfter,
      orderId,
      purchaseOrderId,
      reason,
      userId,
    },
  });

  return product;
};

interface MovementInput {
  productId: string;
  quantity: number; // toujours positive
  reason?: string;
  userId?: string;
}

export const recordEntry = (input: MovementInput) =>
  prisma.$transaction((tx) =>
    applyDelta({
      tx,
      productId: input.productId,
      delta: input.quantity,
      type: 'ENTREE',
      reason: input.reason,
      userId: input.userId,
    })
  );

export const recordLoss = (input: MovementInput & { type?: 'PERTE' | 'CASSE' }) =>
  prisma.$transaction((tx) =>
    applyDelta({
      tx,
      productId: input.productId,
      delta: -input.quantity,
      type: input.type ?? 'PERTE',
      reason: input.reason,
      userId: input.userId,
    })
  );

interface AdjustmentInput {
  productId: string;
  countedQuantity: number; // stock réel constaté à l'inventaire
  reason?: string;
  userId?: string;
}

// Le magasinier donne le stock RÉEL compté (ex. 47), le système calcule
// l'écart avec le stock théorique (50 → 48 dans l'exemple du cahier des charges)
export const recordAdjustment = (input: AdjustmentInput) =>
  prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    const delta = input.countedQuantity - Number(product.stockCurrent);

    if (delta === 0) {
      return product; // le stock théorique était déjà exact, rien à journaliser
    }

    return applyDelta({
      tx,
      productId: input.productId,
      delta,
      type: 'AJUSTEMENT',
      reason: input.reason,
      userId: input.userId,
    });
  });

// Opère dans une transaction FOURNIE par l'appelant — c'est ce qui permet de
// composer le décrément de stock avec d'autres écritures (paiement, statut de
// commande) dans une seule transaction atomique. Utilisée par payment.service.ts.
export const applyStockExits = (
  tx: Prisma.TransactionClient,
  orderId: string,
  exits: { productId: string; quantity: number }[],
  userId?: string
) =>
  Promise.all(
    exits.map((exit) =>
      applyDelta({
        tx,
        productId: exit.productId,
        delta: -exit.quantity,
        type: 'SORTIE_VENTE',
        orderId,
        userId,
      })
    )
  );

// Wrapper autonome avec sa propre transaction, pour un décrément de vente isolé
// (hors du flux de paiement composé — utile pour des tests ou un usage direct).
export const recordExitsForSale = (
  orderId: string,
  exits: { productId: string; quantity: number }[],
  userId?: string
) => prisma.$transaction((tx) => applyStockExits(tx, orderId, exits, userId));

// Symétrique de applyStockExits, pour la réception d'une commande fournisseur —
// opère aussi dans une transaction FOURNIE, composée avec la mise à jour du
// statut de la commande d'achat dans purchaseOrder.service.ts
export const applyStockEntries = (
  tx: Prisma.TransactionClient,
  purchaseOrderId: string,
  entries: { productId: string; quantity: number }[],
  userId?: string
) =>
  Promise.all(
    entries.map((entry) =>
      applyDelta({
        tx,
        productId: entry.productId,
        delta: entry.quantity,
        type: 'ENTREE',
        purchaseOrderId,
        userId,
      })
    )
  );
