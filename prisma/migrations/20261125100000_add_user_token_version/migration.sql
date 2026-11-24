-- Sessions fermées au changement de mot de passe : les jetons émis avant portent
-- l'ancienne valeur. Les sessions en cours (valeur absente) valent 0 et restent
-- ouvertes à la mise en service
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;
