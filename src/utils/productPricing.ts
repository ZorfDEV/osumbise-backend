import { Prisma } from '@prisma/client';

export interface DiscountableProduct {
  sellingPrice: Prisma.Decimal;
  tag: Prisma.Decimal | null;
  tagStartsAt: Date | null;
  tagEndsAt: Date | null;
}

// Sans tagStartsAt/tagEndsAt, la remise s'applique tant que tag est renseigné.
// tagEndsAt est une date (sans heure) : la remise reste active jusqu'à la fin
// de cette journée, pas jusqu'à minuit pile.
export const isTagActive = (product: DiscountableProduct, now: Date = new Date()): boolean => {
  if (product.tag === null) return false;
  if (product.tagStartsAt && now < product.tagStartsAt) return false;
  if (product.tagEndsAt) {
    const endOfDay = new Date(product.tagEndsAt);
    endOfDay.setUTCHours(23, 59, 59, 999);
    if (now > endOfDay) return false;
  }
  return true;
};

export const getEffectivePrice = (product: DiscountableProduct, now: Date = new Date()): number => {
  const sellingPrice = Number(product.sellingPrice);
  if (!isTagActive(product, now)) return sellingPrice;
  const tag = Number(product.tag);
  return Math.round(sellingPrice * (1 - tag / 100) * 100) / 100;
};
