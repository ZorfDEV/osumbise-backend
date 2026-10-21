-- Motif obligatoire et date de mise hors service d'une chambre
-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "out_of_service_at" TIMESTAMP(3),
ADD COLUMN     "out_of_service_reason" TEXT;

