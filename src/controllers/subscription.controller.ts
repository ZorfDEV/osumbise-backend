import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { SelectPlanInput } from '../validators/subscription.validator';
import { InitiatePaymentInput } from '../validators/subscriptionPayment.validator';
import { initiateCollection, checkCollectionStatus } from '../services/airtelMoney.service';
import { applyPaymentResult } from '../services/subscriptionLifecycle.service';

// GET /api/subscription — l'abonnement de l'organisation de l'utilisateur
// connecté (réservé à OWNER via les routes)
export const getSubscription = async (req: Request, res: Response) => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: req.user!.organizationId },
    include: { plan: true },
  });

  if (!subscription) {
    return res.status(404).json({ message: 'Aucun abonnement trouvé' });
  }

  res.status(200).json({ subscription });
};

// POST /api/subscription — choix initial de la formule (page /subscribe, juste
// après l'inscription) ou changement de formule plus tard. Un essai gratuit
// de 14 jours démarre uniquement à la toute première sélection ; changer de
// formule ensuite ne relance pas l'essai.
export const selectPlan = async (req: Request, res: Response) => {
  const { planId } = req.body as SelectPlanInput;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    return res.status(400).json({ message: 'Formule introuvable' });
  }

  const existing = await prisma.subscription.findUnique({
    where: { organizationId: req.user!.organizationId },
  });

  if (existing) {
    const subscription = await prisma.subscription.update({
      where: { organizationId: req.user!.organizationId },
      data: { planId },
      include: { plan: true },
    });
    return res.status(200).json({ subscription });
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const subscription = await prisma.subscription.create({
    data: {
      organizationId: req.user!.organizationId,
      planId,
      status: 'TRIAL',
      currentPeriodEnd: trialEnd,
    },
    include: { plan: true },
  });

  res.status(201).json({ subscription });
};

// POST /api/subscription/pay — déclenche un paiement Mobile Money pour la
// formule en cours. Le paiement reste PENDING jusqu'à confirmation par le
// webhook (voir webhook.controller.ts) ; le frontend interroge
// GET /api/subscription/pay/:paymentId en attendant.
export const initiatePayment = async (req: Request, res: Response) => {
  const { phone } = req.body as InitiatePaymentInput;

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: req.user!.organizationId },
    include: { plan: true },
  });

  if (!subscription) {
    return res
      .status(404)
      .json({ message: 'Aucun abonnement trouvé — choisis une formule avant de payer' });
  }

  const payment = await prisma.subscriptionPayment.create({
    data: {
      subscriptionId: subscription.id,
      amount: subscription.plan.price,
      phone,
      status: 'PENDING',
    },
  });

  try {
    const { externalRef, raw } = await initiateCollection({
      phone,
      amount: Number(subscription.plan.price),
      reference: payment.id,
    });

    const updated = await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { externalRef, providerResponse: raw as object },
    });

    res.status(201).json({ payment: updated });
  } catch (err) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
    res
      .status(502)
      .json({ message: 'Impossible de contacter Airtel Money pour le moment. Réessaie.' });
  }
};

// GET /api/subscription/pay/:paymentId — utilisé par le frontend pour savoir
// quand arrêter d'afficher "en attente de confirmation"
export const getPaymentStatus = async (req: Request, res: Response) => {
  const { paymentId } = req.params;

  let payment = await prisma.subscriptionPayment.findFirst({
    where: {
      id: paymentId,
      subscription: { organizationId: req.user!.organizationId },
    },
  });

  if (!payment) {
    return res.status(404).json({ message: 'Paiement introuvable' });
  }

  // Filet de sécurité : si le webhook n'est pas encore arrivé (normal en
  // développement local sans tunnel public type ngrok, ou en cas d'aléa
  // réseau), on interroge directement Airtel plutôt que de rester bloqué en
  // attente indéfiniment.
  // ⚠️ Forme exacte de la réponse à confirmer une fois la doc Gabon en main.
  if (payment.status === 'PENDING' && payment.externalRef) {
    try {
      const statusData = (await checkCollectionStatus(payment.externalRef)) as {
        data?: { transaction?: { status?: string } };
        transaction?: { status?: string };
      };
      const txStatus = statusData?.data?.transaction?.status ?? statusData?.transaction?.status;

      if (txStatus === 'TS') {
        payment = await applyPaymentResult(payment.id, true, statusData);
      } else if (txStatus === 'TF' || txStatus === 'TA') {
        payment = await applyPaymentResult(payment.id, false, statusData);
      }
      // sinon : toujours en cours côté Airtel aussi, rien à changer ici
    } catch {
      // Best-effort : le webhook reste la source de vérité principale, une
      // erreur ici ne doit pas faire échouer la simple consultation du statut
    }
  }

  res.status(200).json({ payment });
};
