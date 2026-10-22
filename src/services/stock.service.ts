import { Prisma, StockLocation, StockMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';

interface ApplyDeltaParams {
  tx: Prisma.TransactionClient;
  productId: string;
  delta: number; // signé : positif = entrée, négatif = sortie
  type: StockMovementType;
  // Stock touché (vente par défaut : ventes, pertes au bar…)
  location?: StockLocation;
  correctsMovementId?: string;
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
  location = 'SALES',
  orderId,
  purchaseOrderId,
  reason,
  userId,
  correctsMovementId,
}: ApplyDeltaParams) => {
  if (delta === 0) {
    throw Object.assign(new Error('La quantité ne peut pas être nulle'), { status: 400 });
  }

  // Update atomique en base : stock = stock + delta (vente ou réserve).
  // Postgres garantit qu'aucun mouvement simultané sur ce produit (deux ventes
  // en même temps, par exemple) ne peut créer d'incohérence, sans verrou explicite.
  const field = location === 'RESERVE' ? 'stockReserve' : 'stockCurrent';
  const product = await tx.product.update({
    where: { id: productId },
    data: { [field]: { increment: delta } },
  });

  const stockAfter = Number(location === 'RESERVE' ? product.stockReserve : product.stockCurrent);
  const stockBefore = stockAfter - delta;

  if (stockAfter < 0) {
    // Lever ici annule tout le $transaction englobant, y compris l'update
    // qu'on vient de faire — le stock n'est jamais laissé négatif en base
    throw Object.assign(
      new Error(
        `Stock ${location === 'RESERVE' ? 'en réserve' : 'de vente'} insuffisant pour "${product.name}" (disponible : ${stockBefore})`
      ),
      { status: 409 }
    );
  }

  await tx.stockMovement.create({
    data: {
      productId,
      type,
      location,
      quantity: Math.abs(delta),
      stockBefore,
      stockAfter,
      orderId,
      purchaseOrderId,
      reason,
      userId,
      correctsMovementId,
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

export const recordEntry = (input: MovementInput & { location?: StockLocation }) =>
  prisma.$transaction((tx) =>
    applyDelta({
      tx,
      productId: input.productId,
      delta: input.quantity,
      type: 'ENTREE',
      location: input.location ?? 'RESERVE',
      reason: input.reason,
      userId: input.userId,
    })
  );

export const recordLoss = (input: MovementInput & { type?: 'PERTE' | 'CASSE'; location?: StockLocation }) =>
  prisma.$transaction((tx) =>
    applyDelta({
      tx,
      productId: input.productId,
      delta: -input.quantity,
      type: input.type ?? 'PERTE',
      location: input.location ?? 'SALES',
      reason: input.reason,
      userId: input.userId,
    })
  );

interface AdjustmentInput {
  productId: string;
  countedQuantity: number; // stock réel constaté à l'inventaire
  location?: StockLocation;
  reason?: string;
  userId?: string;
}

// Le magasinier donne le stock RÉEL compté (ex. 47), le système calcule
// l'écart avec le stock théorique (50 → 48 dans l'exemple du cahier des charges)
export const recordAdjustment = (input: AdjustmentInput) =>
  prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    const location = input.location ?? 'SALES';
    const delta = input.countedQuantity - Number(location === 'RESERVE' ? product.stockReserve : product.stockCurrent);

    if (delta === 0) {
      return product; // le stock théorique était déjà exact, rien à journaliser
    }

    return applyDelta({
      tx,
      productId: input.productId,
      delta,
      type: 'AJUSTEMENT',
      location,
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
        location: 'RESERVE',
        purchaseOrderId,
        userId,
      })
    )
  );

// Déstockage : réserve → vente (ou retour vente → réserve). Deux mouvements
// TRANSFERT, un par stock, dans la même transaction.
export const recordTransfer = (input: {
  productId: string;
  quantity: number;
  direction: 'TO_SALES' | 'TO_RESERVE';
  reason?: string;
  userId?: string;
}) =>
  prisma.$transaction(async (tx) => {
    const from: StockLocation = input.direction === 'TO_SALES' ? 'RESERVE' : 'SALES';
    const to: StockLocation = input.direction === 'TO_SALES' ? 'SALES' : 'RESERVE';
    const reason = input.reason || (input.direction === 'TO_SALES' ? 'Sortie vers la vente' : 'Retour en réserve');
    await applyDelta({ tx, productId: input.productId, delta: -input.quantity, type: 'TRANSFERT', location: from, reason, userId: input.userId });
    return applyDelta({ tx, productId: input.productId, delta: input.quantity, type: 'TRANSFERT', location: to, reason, userId: input.userId });
  });

// Correction d'une entrée saisie avec une mauvaise quantité : un mouvement
// CORRECTION rétablit l'écart sur le même stock ; motif obligatoire, une seule
// correction par entrée (l'historique garde l'entrée d'origine).
export const correctEntry = (input: { movementId: string; quantity: number; reason: string; userId?: string }) =>
  prisma.$transaction(async (tx) => {
    const original = await tx.stockMovement.findUniqueOrThrow({ where: { id: input.movementId } });
    if (original.type !== 'ENTREE') {
      throw Object.assign(new Error('Seule une entrée de stock peut être corrigée'), { status: 400 });
    }
    const already = await tx.stockMovement.findFirst({ where: { correctsMovementId: original.id } });
    if (already) {
      throw Object.assign(new Error('Cette entrée a déjà été corrigée : faites un ajustement d’inventaire si besoin'), { status: 409 });
    }
    const delta = input.quantity - Number(original.quantity);
    if (delta === 0) {
      throw Object.assign(new Error('La quantité corrigée est identique à celle de l’entrée'), { status: 400 });
    }
    const day = original.createdAt.toLocaleDateString('fr-FR');
    return applyDelta({
      tx,
      productId: original.productId,
      delta,
      type: 'CORRECTION',
      location: original.location,
      reason: `Correction de l'entrée du ${day} : ${Number(original.quantity)} → ${input.quantity} — ${input.reason}`,
      userId: input.userId,
      correctsMovementId: original.id,
    });
  });
