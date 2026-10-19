-- Espèces remises et monnaie rendue (ticket) ; seul le dû entre en caisse
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cash_received" DECIMAL(12,2),
ADD COLUMN     "change_given" DECIMAL(12,2) NOT NULL DEFAULT 0;

