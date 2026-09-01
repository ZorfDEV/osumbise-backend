import { Request, Response } from 'express';
import { parseDayRange } from '../utils/dateRange';
import { getReportData } from '../services/report.service';

export const getSummary = async (req: Request, res: Response) => {
  const { start, end } = parseDayRange(req.query.date as string | undefined);
  const data = await getReportData(req, start, end);
  res.status(200).json(data);
};

export const getHourlySales = async (req: Request, res: Response) => {
  const { start, end } = parseDayRange(req.query.date as string | undefined);

  const payments = await req.db.payment.findMany({
    where: { createdAt: { gte: start, lt: end } },
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0 }));

  for (const payment of payments) {
    const hour = payment.createdAt.getHours();
    hourly[hour].revenue += Number(payment.amount);
  }

  res.status(200).json({ period: { start, end }, hourly });
};

export const getStaffPerformance = async (req: Request, res: Response) => {
  const { start, end } = parseDayRange(req.query.date as string | undefined);

  // Basé sur la création des commandes (l'activité du serveur), pas sur le
  // paiement — cohérent avec l'exemple du document ("Commande créée : 152")
  const orders = await req.db.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { userId: true, status: true, total: true, user: { select: { name: true } } },
  });

  const perStaff = new Map<
    string,
    { name: string; ordersCreated: number; revenue: number; cancelled: number }
  >();

  for (const order of orders) {
    const entry = perStaff.get(order.userId) ?? {
      name: order.user.name,
      ordersCreated: 0,
      revenue: 0,
      cancelled: 0,
    };
    entry.ordersCreated += 1;
    if (order.status === 'PAYEE' || order.status === 'FERMEE') {
      entry.revenue += Number(order.total);
    }
    if (order.status === 'ANNULEE') {
      entry.cancelled += 1;
    }
    perStaff.set(order.userId, entry);
  }

  const staff = Array.from(perStaff.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  res.status(200).json({ period: { start, end }, staff });
};
