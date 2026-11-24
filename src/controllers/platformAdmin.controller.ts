import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { applyPaymentResult } from '../services/subscriptionLifecycle.service';
import { disconnectUser } from '../realtime/socket';
import { localDay } from '../utils/dateRange';
import {
  UpdateSubscriptionAdminInput,
  UpdateOwnerStatusInput,
  ReviewPaymentInput,
  ReviewPlanRequestInput,
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

  const existing = await prisma.subscription.findUnique({ where: { organizationId: id }, include: { plan: true } });
  if (!existing) {
    return res.status(404).json({ message: 'Aucun abonnement pour cette organisation' });
  }

  const subscription = await prisma.subscription.update({
    where: { organizationId: id },
    data: {
      ...(status && { status }),
      // Formule fixée par l'administrateur : une demande en attente n'a plus lieu d'être
      ...(planId && { planId, requestedPlanId: null, requestedPlanAt: null }),
      ...(currentPeriodEnd && { currentPeriodEnd: new Date(currentPeriodEnd) }),
    },
    include: { plan: true },
  });

  // Historique : seulement ce qui a changé
  const changes = [
    existing.status !== subscription.status && `statut ${existing.status} → ${subscription.status}`,
    existing.planId !== subscription.planId && `formule ${existing.plan.name} → ${subscription.plan.name}`,
    existing.currentPeriodEnd.getTime() !== subscription.currentPeriodEnd.getTime() &&
      `fin de période ${localDay(existing.currentPeriodEnd)} → ${localDay(subscription.currentPeriodEnd)}`,
  ].filter(Boolean);
  if (changes.length > 0) {
    await prisma.auditLog.create({
      data: {
        organizationId: id,
        userId: req.user!.id,
        action: `Abonnement modifié par l'administrateur de la plateforme : ${changes.join(', ')}`,
        entityType: 'Subscription',
        entityId: subscription.id,
      },
    });
  }

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
  await prisma.auditLog.create({
    data: {
      organizationId: id,
      userId: req.user!.id,
      action: `Propriétaire ${isActive ? 'réactivé' : 'suspendu'} par l'administrateur de la plateforme`,
      entityType: 'Organization',
      entityId: id,
    },
  });

  const users = await prisma.user.findMany({
    where: { organizationId: id, role: 'OWNER' },
    select: { id: true, name: true, email: true, isActive: true },
  });
  // Connexions temps réel déjà ouvertes coupées aussi
  if (!isActive) users.forEach((u) => disconnectUser(u.id));

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

// GET /api/platform-admin/payments/pending — paiements Mobile Money à vérifier
// sur le compte marchand Airtel avant de les valider
export const listPendingPayments = async (req: Request, res: Response) => {
  const payments = await prisma.subscriptionPayment.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      amount: true,
      phone: true,
      status: true,
      externalRef: true,
      createdAt: true,
      subscription: {
        select: {
          plan: { select: { name: true, price: true } },
          organization: { select: { id: true, name: true } },
        },
      },
    },
  });

  res.status(200).json({ payments });
};

// POST /api/platform-admin/payments/:id/review { approve } — décision manuelle,
// tracée : validé, l'abonnement est activé pour un mois ; rejeté, rien ne change
export const reviewPayment = async (req: Request, res: Response) => {
  const { approve } = req.body as ReviewPaymentInput;

  const existing = await prisma.subscriptionPayment.findUnique({
    where: { id: req.params.id },
    select: { id: true, amount: true, subscription: { select: { organizationId: true } } },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Paiement introuvable' });
  }

  const { payment, applied } = await applyPaymentResult(existing.id, approve);
  if (!applied) {
    return res.status(409).json({ message: 'Ce paiement a déjà été traité' });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: existing.subscription.organizationId,
      userId: req.user!.id,
      action: `Paiement d'abonnement de ${Number(existing.amount)} FCFA ${approve ? 'validé' : 'rejeté'} manuellement`,
      entityType: 'SubscriptionPayment',
      entityId: existing.id,
    },
  });

  res.status(200).json({ payment: { id: payment.id, status: payment.status } });
};

// GET /api/platform-admin/plan-requests — formules plus chères demandées en
// cours de période payée
export const listPlanRequests = async (req: Request, res: Response) => {
  const requests = await prisma.subscription.findMany({
    where: { requestedPlanId: { not: null } },
    orderBy: { requestedPlanAt: 'asc' },
    select: {
      id: true,
      currentPeriodEnd: true,
      requestedPlanAt: true,
      plan: { select: { name: true, price: true } },
      requestedPlan: { select: { id: true, name: true, price: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  res.status(200).json({ requests });
};

// POST /api/platform-admin/plan-requests/:id/review { approve, planId } — id
// d'abonnement. planId : la formule affichée à l'administrateur, pour ne pas
// valider une autre demande faite entre-temps. La date de fin ne change pas.
export const reviewPlanRequest = async (req: Request, res: Response) => {
  const { approve, planId } = req.body as ReviewPlanRequestInput;

  const existing = await prisma.subscription.findUnique({
    where: { id: req.params.id },
    select: { id: true, organizationId: true, plan: { select: { name: true } }, requestedPlan: { select: { name: true } } },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Abonnement introuvable' });
  }

  const { count } = await prisma.subscription.updateMany({
    where: { id: existing.id, requestedPlanId: planId },
    data: { ...(approve && { planId }), requestedPlanId: null, requestedPlanAt: null },
  });
  if (count === 0) {
    return res.status(409).json({ message: 'Cette demande a changé ou a déjà été traitée' });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: existing.organizationId,
      userId: req.user!.id,
      action: `Changement de formule ${existing.plan.name} → ${existing.requestedPlan?.name ?? ''} ${approve ? 'validé' : 'refusé'}`,
      entityType: 'Subscription',
      entityId: existing.id,
    },
  });

  res.status(200).json({ message: approve ? 'Formule changée' : 'Demande refusée' });
};
