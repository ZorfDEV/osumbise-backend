-- Versement de séjour : espèces remises et monnaie rendue
-- AlterTable
ALTER TABLE "stay_payments" ADD COLUMN     "cash_received" DECIMAL(12,2),
ADD COLUMN     "change_given" DECIMAL(12,2) NOT NULL DEFAULT 0;

