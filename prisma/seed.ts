import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  {
    name: 'Starter',
    price: 15000,
    maxEstablishments: 1,
    maxUsers: 5,
    features: [
      '1 établissement',
      "Jusqu'à 5 utilisateurs",
      'Point de vente complet (tables, comptoir, paiement espèces/carte/mobile money)',
      'Gestion des stocks avec recettes et décrément automatique',
      'Sessions de caisse',
      'Rapports journaliers et mensuels',
      'Mode hors ligne — continuez de vendre même sans connexion',
      'Facture imprimable à votre nom',
      'Support par email',
    ],
  },
  {
    name: 'Business',
    price: 35000,
    maxEstablishments: 3,
    maxUsers: 20,
    features: [
      "Jusqu'à 3 établissements",
      "Jusqu'à 20 utilisateurs",
      'Tout Starter, plus :',
      'Gestion des fournisseurs et commandes d’achat',
      'Suivi des dépenses par catégorie',
      'Rapports annuels et sur période personnalisée, export CSV/PDF',
      'Écran cuisine connecté en temps réel',
      'Support prioritaire — réponse sous 24h',
    ],
  },
  {
    name: 'Enterprise',
    price: 65000,
    maxEstablishments: 999,
    maxUsers: 999,
    features: [
      'Établissements illimités',
      'Utilisateurs illimités',
      'Tout Business, plus :',
      'Accompagnement personnalisé au démarrage',
      'Support prioritaire par téléphone/WhatsApp',
      'Interlocuteur dédié pour vos besoins spécifiques',
    ],
  },
];

async function main() {
  for (const plan of PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({ where: { id: existing.id }, data: plan });
    } else {
      await prisma.plan.create({ data: plan });
    }
  }
  console.log(`${PLANS.length} plans initialisés (Starter / Business / Enterprise).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
