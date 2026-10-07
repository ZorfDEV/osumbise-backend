import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import {
  UpdateSubscriptionAdminInput,
  UpdateOwnerStatusInput,
} from '../validators/platformAdmin.validator';

// GET /api/platform-admin/organizations?search=...
export const listOrganizations = async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };

  const organizations = await prisma.organization.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { users: { some: { email: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : undefined,
    include: {
      users: {
        where: { role: 'OWNER' },
        select: { id: true, name: true, email: true, isActive: true },
      },
      subscription: { include: { plan: true } },
      _count: { select: { establishments: true, users: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ organizations });
};

// GET /api/platform-admin/organizations/:id
export const getOrganization = async (req: Request, res: Response) => {
  const { id } = req.params;

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      establishments: { select: { id: true, name: true, type: true } },
      subscription: {
        include: {
          plan: true,
          payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      },
    },
  });

  if (!organization) {
    return res.status(404).json({ message: 'Organisation introuvable' });
  }

  res.status(200).json({ organization });
};

// PATCH /api/platform-admin/organizations/:id/subscription
// Intervention manuelle : activer après un paiement reçu hors app (virement,
// espèces...), changer de formule pour le compte du client, prolonger une
// période (réabonnement), ou annuler.
export const updateSubscriptionAdmin = async (req: Request, res: Response) => {
  const { id } = req.params; // id d'organisation
  const { status, planId, currentPeriodEnd } = req.body as UpdateSubscriptionAdminInput;

  const existing = await prisma.subscription.findUnique({ where: { organizationId: id } });
  if (!existing) {
    return res.status(404).json({ message: 'Aucun abonnement pour cette organisation' });
  }

  const subscription = await prisma.subscription.update({
    where: { organizationId: id },
    data: {
      ...(status && { status }),
      ...(planId && { planId }),
      ...(currentPeriodEnd && { currentPeriodEnd: new Date(currentPeriodEnd) }),
    },
    include: { plan: true },
  });

  res.status(200).json({ subscription });
};

// PATCH /api/platform-admin/organizations/:id/owner-status
// Suspend ou réactive le(s) compte(s) OWNER d'une organisation — utile en cas
// d'impayé prolongé ou de non-respect des conditions d'utilisation.
export const updateOwnerStatus = async (req: Request, res: Response) => {
  const { id } = req.params; // id d'organisation
  const { isActive } = req.body as UpdateOwnerStatusInput;

  await prisma.user.updateMany({
    where: { organizationId: id, role: 'OWNER' },
    data: { isActive },
  });

  const users = await prisma.user.findMany({
    where: { organizationId: id, role: 'OWNER' },
    select: { id: true, name: true, email: true, isActive: true },
  });

  res.status(200).json({ users });
};

// GET /api/platform-admin/revenue
export const getRevenueSummary = async (req: Request, res: Response) => {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: { status: 'ACTIVE' },
    include: { plan: true },
  });

  const mrr = activeSubscriptions.reduce((sum, s) => sum + Number(s.plan.price), 0);

  const statusCounts = await prisma.subscription.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const totalCollectedResult = await prisma.subscriptionPayment.aggregate({
    where: { status: 'SUCCESS' },
    _sum: { amount: true },
  });

  const byPlanMap = new Map<string, { planName: string; count: number; monthlyRevenue: number }>();
  for (const sub of activeSubscriptions) {
    const existing = byPlanMap.get(sub.planId) ?? {
      planName: sub.plan.name,
      count: 0,
      monthlyRevenue: 0,
    };
    existing.count += 1;
    existing.monthlyRevenue += Number(sub.plan.price);
    byPlanMap.set(sub.planId, existing);
  }

  res.status(200).json({
    mrr,
    totalCollected: Number(totalCollectedResult._sum.amount ?? 0),
    statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    byPlan: Array.from(byPlanMap.values()),
  });
};
