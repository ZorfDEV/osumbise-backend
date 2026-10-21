-- Auteur et date de création d'une caisse (limite de 2 par jour pour une caissière)
-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by_id" TEXT;

