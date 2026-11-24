import { Prisma } from '@prisma/client';
import { localDay } from './dateRange';

export interface DiscountableProduct {
  sellingPrice: Prisma.Decimal;
  tag: Prisma.Decimal | null;
  tagStartsAt: Date | null;
  tagEndsAt: Date | null;
}

// Sans tagStartsAt/tagEndsAt, la remise s'applique tant que tag est renseigné.
// Les deux dates sont des jours (sans heure) : la remise court de minuit le
// premier jour à minuit après le dernier, à l'heure de Libreville.
export const isTagActive = (product: DiscountableProduct, now: Date = new Date()): boolean => {
  if (product.tag === null) return false;
  const day = localDay(now);
  // Colonne de type date : le jour saisi est la partie date en UTC
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
  if (product.tagStartsAt && day < dateOnly(product.tagStartsAt)) return false;
  if (product.tagEndsAt && day > dateOnly(product.tagEndsAt)) return false;
  return true;
};

export const getEffectivePrice = (product: DiscountableProduct, now: Date = new Date()): number => {
  const sellingPrice = Number(product.sellingPrice);
  if (!isTagActive(product, now)) return sellingPrice;
  const tag = Number(product.tag);
  return Math.round(sellingPrice * (1 - tag / 100) * 100) / 100;
};
