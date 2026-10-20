-- Administrateur avec accès à tous les établissements du propriétaire
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "multi_establishment" BOOLEAN NOT NULL DEFAULT false;

