import { Prisma, StockLocation, StockMovementType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { LOCAL_TIME_ZONE } from '../utils/dateRange';

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

// Mouvements saisis à la main qui peuvent être corrigés (une seule fois)
export const CORRECTABLE_TYPES: StockMovementType[] = ['ENTREE', 'PERTE', 'CASSE', 'AJUSTEMENT'];
const CORRECTION_LABELS: Partial<Record<StockMovementType, string>> = {
  ENTREE: "l'entrée",
  PERTE: 'la perte',
  CASSE: 'la casse',
  AJUSTEMENT: "l'ajustement",
};

// Corrige un mouvement erroné par un mouvement CORRECTION qui en garde la
// trace. `quantity` est la bonne valeur : quantité entrée, perdue ou cassée,
// ou, pour un ajustement, le stock réellement compté ce jour-là. Le stock
// actuel est décalé de l'écart entre l'effet saisi et l'effet corrigé.
// `location` (entrée seulement) : le bon stock, si l'entrée a été rangée en
// réserve au lieu de la vente ou l'inverse.
export const correctEntry = (input: {
  movementId: string;
  quantity: number;
  location?: StockLocation;
  reason: string;
  userId?: string;
}) =>
  prisma.$transaction(async (tx) => {
    const original = await tx.stockMovement.findUniqueOrThrow({ where: { id: input.movementId } });
    if (!CORRECTABLE_TYPES.includes(original.type)) {
      throw Object.assign(new Error('Seuls une entrée, une perte, une casse ou un ajustement peuvent être corrigés'), { status: 400 });
    }
    const label = CORRECTION_LABELS[original.type];
    const already = await tx.stockMovement.findFirst({ where: { correctsMovementId: original.id } });
    if (already) {
      throw Object.assign(new Error(`${label!.charAt(0).toUpperCase()}${label!.slice(1)} a déjà été corrigé(e) : faites un ajustement d’inventaire si besoin`), { status: 409 });
    }

    const day = original.createdAt.toLocaleDateString('fr-FR', { timeZone: LOCAL_TIME_ZONE });

    // Mauvais stock : la quantité saisie quitte l'ancien (refusé si elle n'y est
    // plus) et la bonne quantité entre dans le nouveau
    if (input.location && input.location !== original.location) {
      if (original.type !== 'ENTREE') {
        throw Object.assign(new Error('Le stock concerné ne peut être corrigé que sur une entrée'), { status: 400 });
      }
      if (input.quantity === 0) {
        throw Object.assign(new Error('Pour annuler l’entrée (quantité 0), laissez le stock d’origine'), { status: 400 });
      }
      const name = (l: StockLocation) => (l === 'RESERVE' ? 'Réserve' : 'Vente');
      const move = {
        tx,
        productId: original.productId,
        type: 'CORRECTION' as const,
        reason: `Correction de ${label} du ${day} : ${Number(original.quantity)} en ${name(original.location)} → ${input.quantity} en ${name(input.location)} — ${input.reason}`,
        userId: input.userId,
        correctsMovementId: original.id,
      };
      await applyDelta({ ...move, delta: -Number(original.quantity), location: original.location });
      return applyDelta({ ...move, delta: input.quantity, location: input.location });
    }

    // Valeur saisie à l'origine, dans la même unité que `quantity`
    const before = original.type === 'AJUSTEMENT' ? Number(original.stockAfter) : Number(original.quantity);
    // Entrée : plus de quantité = plus de stock ; perte/casse : l'inverse ;
    // ajustement : le stock suit le nouveau comptage
    const delta = original.type === 'PERTE' || original.type === 'CASSE' ? before - input.quantity : input.quantity - before;
    if (delta === 0) {
      throw Object.assign(new Error('La quantité corrigée est identique à celle saisie'), { status: 400 });
    }
    return applyDelta({
      tx,
      productId: original.productId,
      delta,
      type: 'CORRECTION',
      location: original.location,
      reason: `Correction de ${label} du ${day} : ${before} → ${input.quantity} — ${input.reason}`,
      userId: input.userId,
      correctsMovementId: original.id,
    });
  });
