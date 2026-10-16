-- Taxe du produit (%) figée sur chaque ligne de commande
-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
