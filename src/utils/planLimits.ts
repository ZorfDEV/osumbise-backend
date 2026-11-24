import { prisma } from '../config/prisma';

// Renvoie un message d'erreur si la limite du plan est atteinte, sinon null.
// Si l'organisation n'a pas d'abonnement (ne devrait pas arriver pour un
// compte créé via /register), on ne bloque pas — mieux vaut ne pas casser
// l'usage existant qu'appliquer une limite sur une donnée manquante.
export const checkEstablishmentLimit = async (organizationId: string): Promise<string | null> => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!subscription) return null;

  const count = await prisma.establishment.count({ where: { organizationId } });
  if (count >= subscription.plan.maxEstablishments) {
    return `Ta formule "${subscription.plan.name}" est limitée à ${subscription.plan.maxEstablishments} établissement(s). Passe à une formule supérieure pour en ajouter.`;
  }
  return null;
};

export const checkUserLimit = async (organizationId: string): Promise<string | null> => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  if (!subscription) return null;

  const count = await prisma.user.count({ where: { organizationId } });
  if (count >= subscription.plan.maxUsers) {
    return `Ta formule "${subscription.plan.name}" est limitée à ${subscription.plan.maxUsers} utilisateur(s). Passe à une formule supérieure pour en ajouter.`;
  }
  return null;
};

// Passage à une formule plus petite : refusé tant que l'organisation dépasse
// ses limites. Renvoie un message d'erreur, sinon null.
export const checkPlanFits = async (
  organizationId: string,
  plan: { name: string; maxEstablishments: number; maxUsers: number }
): Promise<string | null> => {
  const [establishments, users] = await Promise.all([
    prisma.establishment.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
  ]);
  if (establishments > plan.maxEstablishments) {
    return `La formule "${plan.name}" est limitée à ${plan.maxEstablishments} établissement(s) : tu en as ${establishments}.`;
  }
  if (users > plan.maxUsers) {
    return `La formule "${plan.name}" est limitée à ${plan.maxUsers} utilisateur(s) : tu en as ${users}.`;
  }
  return null;
};
