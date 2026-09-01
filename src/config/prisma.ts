import { PrismaClient } from '@prisma/client';

// En dev, ts-node-dev recharge le module à chaque changement de fichier.
// Sans ceci, chaque rechargement créerait une nouvelle connexion à la base.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
