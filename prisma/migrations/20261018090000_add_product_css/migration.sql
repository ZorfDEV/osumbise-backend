-- CSS (contribution spéciale de solidarité) par produit, figée sur chaque ligne de commande
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "css" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "css_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

