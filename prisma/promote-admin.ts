// Usage : npx tsx prisma/promote-admin.ts email@exemple.com
// Promeut un utilisateur EXISTANT (crée d'abord ton compte normalement via
// /register si ce n'est pas déjà fait) en administrateur plateforme.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage : npx tsx prisma/promote-admin.ts email@exemple.com');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { isPlatformAdmin: true },
  });

  console.log(`${user.name} (${user.email}) est maintenant administrateur plateforme.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
