-- Remise sur la facture d'une commande ou d'un séjour (% ou montant, motif)
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount_rate" DECIMAL(5,2),
ADD COLUMN     "discount_reason" TEXT;

-- AlterTable
ALTER TABLE "stays" ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_rate" DECIMAL(5,2),
ADD COLUMN     "discount_reason" TEXT;

