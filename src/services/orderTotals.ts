// Totaux d'une commande — MÊME calcul que le frontend (features/pos/taxes.ts),
// pour que le serveur, l'écran et le ticket donnent exactement les mêmes montants.
//
// - Article à prix HT : TVA et CSS s'ajoutent au prix.
// - Article à prix TTC fixe : le prix payé est fixe ; TVA et CSS sont calculées
//   À L'INTÉRIEUR du prix et le HT s'en déduit, si bien que le total TTC tombe
//   pile sur le prix affiché (25 000 reste 25 000).
// Chaque taxe est arrondie au franc par groupe de taux. Une remise en % est
// appliquée telle quelle aux prix ; une remise en montant, au prorata du HT.

export interface TotalsItem {
  quantity: number;
  unitPrice: number;
  taxRate: number;
  cssRate: number;
  priceIncludesTax: boolean;
}

export interface TaxLine {
  label: 'TVA' | 'CSS';
  rate: number;
  amount: number;
}

export const computeOrderTotals = (items: TotalsItem[], discountCfg: { amount: number; rate: number | null }) => {
  // Bases : prix HT (taxes ajoutées) ou prix TTC (taxes incluses, total des taux)
  const added = new Map<string, { label: TaxLine['label']; rate: number; base: number }>();
  const included = new Map<string, { label: TaxLine['label']; rate: number; total: number; base: number }>();
  let htAdded = 0;
  let grossIncluded = 0;
  for (const it of items) {
    const gross = it.quantity * it.unitPrice;
    const totalRate = it.taxRate + it.cssRate;
    const kinds: [TaxLine['label'], number][] = [
      ['TVA', it.taxRate],
      ['CSS', it.cssRate],
    ];
    if (it.priceIncludesTax) {
      grossIncluded += gross;
      for (const [label, rate] of kinds) {
        if (!rate) continue;
        const key = `${label}-${rate}-${totalRate}`;
        const g = included.get(key) ?? { label, rate, total: totalRate, base: 0 };
        g.base += gross;
        included.set(key, g);
      }
    } else {
      htAdded += gross;
      for (const [label, rate] of kinds) {
        if (!rate) continue;
        const key = `${label}-${rate}`;
        const g = added.get(key) ?? { label, rate, base: 0 };
        g.base += gross;
        added.set(key, g);
      }
    }
  }

  const includedTax = (ratio: number) =>
    [...included.values()].map((g) => ({
      label: g.label,
      rate: g.rate,
      amount: Math.round((g.base * ratio * g.rate) / (100 + g.total)),
    }));
  const addedTax = (ratio: number) =>
    [...added.values()].map((g) => ({ label: g.label, rate: g.rate, amount: Math.round((g.base * ratio * g.rate) / 100) }));
  const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);

  // HT avant remise : prix HT + (prix TTC fixes − taxes qu'ils contiennent)
  const subtotal = htAdded + grossIncluded - sum(includedTax(1));

  // Remise : en %, appliquée telle quelle aux prix (un TTC fixe remisé de 10 %
  // tombe pile sur 90 % du prix) ; en montant, au prorata du HT
  const requested =
    discountCfg.rate !== null ? Math.round((subtotal * discountCfg.rate) / 100) : Math.min(discountCfg.amount, subtotal);
  const ratio = discountCfg.rate !== null ? 1 - discountCfg.rate / 100 : subtotal > 0 ? (subtotal - requested) / subtotal : 1;

  // Lignes de taxe (une par taxe et par taux), après remise
  const addedAfter = addedTax(ratio);
  const includedAfter = includedTax(ratio);
  const merged = new Map<string, TaxLine>();
  for (const t of [...addedAfter, ...includedAfter]) {
    const key = `${t.label}-${t.rate}`;
    const m = merged.get(key) ?? { label: t.label, rate: t.rate, amount: 0 };
    m.amount += t.amount;
    merged.set(key, m);
  }
  const lines = [...merged.values()]
    .filter((l) => l.amount !== 0)
    .sort((a, b) => (a.label === b.label ? b.rate - a.rate : a.label === 'TVA' ? -1 : 1));
  const tax = sum(lines);

  // Remise en montant : enregistrée telle quelle (elle sert de base au
  // prochain recalcul, elle ne doit pas varier d'un franc à chaque fois)
  if (discountCfg.rate === null) {
    return { subtotal, discount: requested, tax, total: subtotal - requested + tax, lines };
  }

  // Remise en % : la part à prix TTC fixe garde un TTC rond, dont on déduit
  // ses taxes ; la remise affichée est l'écart avec le HT d'origine
  const htIncludedAfter = Math.round(grossIncluded * ratio) - sum(includedAfter);
  const htAddedAfter = Math.round(htAdded * ratio);
  const discount = subtotal - (htAddedAfter + htIncludedAfter);

  return { subtotal, discount, tax, total: htAddedAfter + htIncludedAfter + tax, lines };
};
