import { Request } from 'express';
import PDFDocument from 'pdfkit';

interface ReportData {
  period: { start: Date; end: Date };
  revenue: number;
  orderCount: number;
  clientCount: number;
  averageBasket: number;
  profit: number;
  merchandiseCost: number;
  expenses: number;
  margin: number;
  paymentBreakdown: Record<string, number>;
  topProducts: { productId: string; name: string; quantity: number }[];
  topCategories: { categoryId: string; name: string; profit: number }[];
  // Hôtel (null si l'établissement n'a aucune chambre)
  hotel: HotelReport | null;
}

interface HotelReport {
  // Facturé : séjours terminés (départ dans la période) + avances conservées
  // sur les réservations annulées dans la période
  checkedOutStays: number;
  nights: number;
  lodging: number;
  stayTax: number;
  // Prestations (pressing, room service…) des séjours terminés
  services: number;
  // Remises accordées sur ces séjours
  discounts: number;
  cancellationFees: number;
  billed: number;
  // Encaissé dans la période (avances et soldes), net des remboursements
  received: Record<string, number>;
  receivedTotal: number;
  refunds: number;
  // Avances détenues aujourd'hui sur des réservations pas encore arrivées
  advancesHeld: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const getHotelReport = async (req: Request, start: Date, end: Date): Promise<HotelReport | null> => {
  const roomCount = await req.db.room.count();
  if (roomCount === 0) return null;

  const checkedOut = await req.db.stay.findMany({
    where: { status: 'CHECKED_OUT', checkedOutAt: { gte: start, lt: end } },
    select: {
      checkInDate: true,
      checkOutDate: true,
      nightlyRate: true,
      taxPerNight: true,
      charges: { select: { quantity: true, unitPrice: true } },
      discount: true,
      discountRate: true,
      orders: { where: { status: { in: ['PAYEE', 'FERMEE'] } }, select: { payments: { select: { method: true, amount: true } } } },
    },
  });
  let nights = 0;
  let discounts = 0;
  let lodging = 0;
  let stayTax = 0;
  let services = 0;
  for (const s of checkedOut) {
    const n = Math.max(1, Math.round((s.checkOutDate.getTime() - s.checkInDate.getTime()) / DAY_MS));
    nights += n;
    lodging += n * Number(s.nightlyRate);
    stayTax += n * Number(s.taxPerNight);
    const stayServices = s.charges.reduce((sum, c) => sum + c.quantity * Number(c.unitPrice), 0);
    services += stayServices;
    // Remise du séjour (même calcul que computeTotals)
    const roomCharges = s.orders.reduce(
      (sum, o) => sum + o.payments.filter((p) => p.method === 'ROOM').reduce((t, p) => t + Number(p.amount), 0),
      0
    );
    const base = n * Number(s.nightlyRate) + stayServices + roomCharges;
    discounts += s.discountRate !== null ? Math.round((base * Number(s.discountRate)) / 100) : Math.min(Number(s.discount), base);
  }

  // Avances conservées : solde net encaissé des réservations annulées
  const cancelled = await req.db.stay.findMany({
    where: { status: 'CANCELLED', updatedAt: { gte: start, lt: end } },
    select: { payments: { select: { amount: true } } },
  });
  const cancellationFees = cancelled.reduce(
    (sum, s) => sum + Math.max(0, s.payments.reduce((t, p) => t + Number(p.amount), 0)),
    0
  );

  const payments = await req.db.stayPayment.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { method: true, amount: true },
  });
  const received = new Map<string, number>();
  let refunds = 0;
  for (const p of payments) {
    const amount = Number(p.amount);
    if (amount < 0) refunds += -amount;
    received.set(p.method, (received.get(p.method) ?? 0) + amount);
  }
  const receivedTotal = [...received.values()].reduce((a, b) => a + b, 0);

  const reserved = await req.db.stay.findMany({
    where: { status: 'RESERVED' },
    select: { payments: { select: { amount: true } } },
  });
  const advancesHeld = reserved.reduce((sum, s) => sum + s.payments.reduce((t, p) => t + Number(p.amount), 0), 0);

  return {
    checkedOutStays: checkedOut.length,
    nights,
    lodging,
    stayTax,
    services,
    discounts,
    cancellationFees,
    billed: lodging + stayTax + services - discounts + cancellationFees,
    received: Object.fromEntries(received),
    receivedTotal,
    refunds,
    advancesHeld,
  };
};

export const getReportData = async (
  req: Request,
  start: Date,
  end: Date
): Promise<ReportData> => {
  // Une commande compte dans la période où elle a été PAYÉE (via ses paiements),
  // pas où elle a été créée
  const orders = await req.db.order.findMany({
    where: {
      status: { in: ['PAYEE', 'FERMEE'] },
      payments: { some: { createdAt: { gte: start, lt: end } } },
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              name: true,
              cost: true,
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      },
      payments: true,
    },
  });

  const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const orderCount = orders.length;
  const averageBasket = orderCount > 0 ? revenue / orderCount : 0;

  let profit = 0;
  let merchandiseCost = 0;
  const paymentBreakdown = new Map<string, number>();
  const productSales = new Map<string, { name: string; quantity: number }>();
  const categoryProfit = new Map<string, { name: string; profit: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      // Coût ACTUEL du produit, pas figé au moment de la vente — voir la note
      // dans dashboard.controller.ts sur cette limite du MVP
      const cost = item.quantity * Number(item.product.cost);
      const itemProfit = item.quantity * Number(item.unitPrice) - cost;
      profit += itemProfit;
      merchandiseCost += cost;

      const productEntry = productSales.get(item.productId) ?? {
        name: item.product.name,
        quantity: 0,
      };
      productEntry.quantity += item.quantity;
      productSales.set(item.productId, productEntry);

      const categoryEntry = categoryProfit.get(item.product.categoryId) ?? {
        name: item.product.category.name,
        profit: 0,
      };
      categoryEntry.profit += itemProfit;
      categoryProfit.set(item.product.categoryId, categoryEntry);
    }

    for (const payment of order.payments) {
      if (payment.createdAt >= start && payment.createdAt < end) {
        paymentBreakdown.set(
          payment.method,
          (paymentBreakdown.get(payment.method) ?? 0) + Number(payment.amount)
        );
      }
    }
  }

  // Dépenses catégorisées (section 21 du document) — distinctes des sorties
  // de caisse ponctuelles, qui ne couvrent que l'argent physique du tiroir
  const expenseRecords = await req.db.expense.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });
  const expenses = expenseRecords.reduce((sum, e) => sum + Number(e.amount), 0);

  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const hotel = await getHotelReport(req, start, end);

  return {
    period: { start, end },
    revenue,
    orderCount,
    // Approximation : une commande ≈ un client/une table. Pas de modèle Client
    // dédié dans ce MVP (prévu en V2 selon le document)
    clientCount: orderCount,
    averageBasket,
    profit,
    merchandiseCost,
    expenses,
    margin,
    paymentBreakdown: Object.fromEntries(paymentBreakdown),
    topProducts: Array.from(productSales.entries())
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.quantity - a.quantity),
    topCategories: Array.from(categoryProfit.entries())
      .map(([categoryId, data]) => ({ categoryId, ...data }))
      .sort((a, b) => b.profit - a.profit),
    hotel,
  };
};

const toCsvValue = (value: unknown): string => {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const toCsvRow = (values: unknown[]): string => values.map(toCsvValue).join(',') + '\n';

export const buildReportCsv = (data: ReportData): string => {
  let csv = '';

  csv += toCsvRow(['Indicateur', 'Valeur']);
  csv += toCsvRow(['Chiffre d’affaires', data.revenue]);
  csv += toCsvRow(['Nombre de commandes', data.orderCount]);
  csv += toCsvRow(['Nombre de clients (estimation)', data.clientCount]);
  csv += toCsvRow(['Panier moyen', data.averageBasket.toFixed(2)]);
  csv += toCsvRow(['Coût des marchandises', data.merchandiseCost]);
  csv += toCsvRow(['Bénéfice estimé', data.profit]);
  csv += toCsvRow(['Marge (%)', data.margin.toFixed(2)]);
  csv += '\n';

  csv += toCsvRow(['Mode de paiement', 'Montant']);
  for (const [method, amount] of Object.entries(data.paymentBreakdown)) {
    csv += toCsvRow([method, amount]);
  }
  csv += '\n';

  csv += toCsvRow(['Produit', 'Quantité vendue']);
  for (const p of data.topProducts) {
    csv += toCsvRow([p.name, p.quantity]);
  }

  if (data.hotel) {
    const h = data.hotel;
    csv += '\n';
    csv += toCsvRow(['Hébergement', 'Valeur']);
    csv += toCsvRow(['Séjours terminés', h.checkedOutStays]);
    csv += toCsvRow(['Nuitées', h.nights]);
    csv += toCsvRow(['Hébergement facturé', h.lodging]);
    csv += toCsvRow(['Taxe de séjour', h.stayTax]);
    csv += toCsvRow(['Prestations (pressing, room service…)', h.services]);
    csv += toCsvRow(['Remises accordées', -h.discounts]);
    csv += toCsvRow(['Avances conservées (annulations)', h.cancellationFees]);
    csv += toCsvRow(['Total hébergement facturé', h.billed]);
    csv += toCsvRow(['Encaissé (avances et soldes, net)', h.receivedTotal]);
    for (const [method, amount] of Object.entries(h.received)) csv += toCsvRow([`  dont ${method}`, amount]);
    csv += toCsvRow(['Remboursements', h.refunds]);
    csv += toCsvRow(['Avances détenues (réservations à venir)', h.advancesHeld]);
  }

  return csv;
};

const formatFcfa = (value: number) => `${value.toLocaleString('fr-FR')} FCFA`;

export const buildReportPdf = (data: ReportData, title: string): PDFKit.PDFDocument => {
  const doc = new PDFDocument({ margin: 40 });

  doc.fontSize(18).text(title, { align: 'center' });
  doc.moveDown();

  const endInclusive = new Date(data.period.end.getTime() - 1);
  doc
    .fontSize(11)
    .text(
      `Période : ${data.period.start.toLocaleDateString('fr-FR')} — ${endInclusive.toLocaleDateString('fr-FR')}`
    );
  doc.moveDown();

  const line = (label: string, value: string) => doc.text(`${label} : ${value}`);

  line('Chiffre d’affaires', formatFcfa(data.revenue));
  line('Nombre de commandes', String(data.orderCount));
  line('Panier moyen', formatFcfa(Math.round(data.averageBasket)));
  line('Coût des marchandises', formatFcfa(data.merchandiseCost));
  line('Bénéfice estimé', formatFcfa(data.profit));
  line('Marge', `${data.margin.toFixed(1)} %`);

  doc.moveDown();
  doc.fontSize(13).text('Modes de paiement');
  doc.fontSize(11);
  for (const [method, amount] of Object.entries(data.paymentBreakdown)) {
    doc.text(`${method} : ${formatFcfa(Number(amount))}`);
  }

  doc.moveDown();
  doc.fontSize(13).text('Produits les plus vendus');
  doc.fontSize(11);
  for (const p of data.topProducts.slice(0, 15)) {
    doc.text(`${p.name} — ${p.quantity}`);
  }

  if (data.hotel) {
    const h = data.hotel;
    doc.moveDown();
    doc.fontSize(13).text('Hébergement');
    doc.fontSize(11);
    line('Séjours terminés', `${h.checkedOutStays} (${h.nights} nuitées)`);
    line('Hébergement facturé', formatFcfa(h.lodging));
    line('Taxe de séjour', formatFcfa(h.stayTax));
    line('Prestations (pressing, room service…)', formatFcfa(h.services));
    line('Remises accordées', formatFcfa(-h.discounts));
    line('Avances conservées (annulations)', formatFcfa(h.cancellationFees));
    line('Total hébergement facturé', formatFcfa(h.billed));
    line('Encaissé (avances et soldes, net)', formatFcfa(h.receivedTotal));
    line('Remboursements', formatFcfa(h.refunds));
    line('Avances détenues (réservations à venir)', formatFcfa(h.advancesHeld));
  }

  return doc;
};
