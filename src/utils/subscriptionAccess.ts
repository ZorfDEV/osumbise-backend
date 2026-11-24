import { prisma } from '../config/prisma';

// Abonnement expiré : 7 jours de grâce (bandeau d'avertissement), puis lecture
// seule — les données restent consultables, plus rien ne peut être modifié.
// Seule la date de fin de période décide, quel que soit le statut affiché.
const DAY_MS = 24 * 60 * 60 * 1000;
export const GRACE_DAYS = 7;

// Début d'application de la règle : le délai de grâce ne court jamais avant, pour
// que personne ne soit coupé sans préavis à la mise en service. Peut être
// repoussé sur l'hébergeur avec SUBSCRIPTION_ENFORCEMENT_START (AAAA-MM-JJ).
const DEFAULT_START = new Date('2026-12-01T00:00:00+01:00');
const enforcementStart = (): Date => {
  const custom = new Date(process.env.SUBSCRIPTION_ENFORCEMENT_START ?? '');
  return Number.isNaN(custom.getTime()) ? DEFAULT_START : custom;
};

export interface SubscriptionAccess {
  state: 'OK' | 'GRACE' | 'READ_ONLY';
  // Fin de l'essai ou de la période payée ; null : aucune formule choisie
  endedAt: Date | null;
  // Passage en lecture seule sans renouvellement ; null si tout est à jour
  readOnlyAt: Date | null;
}

export const computeAccess = (
  organization: { createdAt: Date; subscription: { currentPeriodEnd: Date } | null },
  now = new Date()
): SubscriptionAccess => {
  // Sans formule choisie : le délai court depuis l'inscription
  const end = organization.subscription?.currentPeriodEnd ?? organization.createdAt;
  const endedAt = organization.subscription ? end : null;
  if (now <= end) return { state: 'OK', endedAt, readOnlyAt: null };

  const from = Math.max(end.getTime(), enforcementStart().getTime());
  const readOnlyAt = new Date(from + GRACE_DAYS * DAY_MS);
  return { state: now < readOnlyAt ? 'GRACE' : 'READ_ONLY', endedAt, readOnlyAt };
};

export const getSubscriptionAccess = async (organizationId: string): Promise<SubscriptionAccess> => {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { createdAt: true, subscription: { select: { currentPeriodEnd: true } } },
  });
  return computeAccess(organization);
};
