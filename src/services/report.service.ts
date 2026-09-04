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
}

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

  return doc;
};
