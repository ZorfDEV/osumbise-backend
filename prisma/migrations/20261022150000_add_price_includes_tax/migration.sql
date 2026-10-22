-- Prix TTC fixe (taxes incluses) sur le produit, figé sur la ligne de commande
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "price_includes_tax" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "price_includes_tax" BOOLEAN NOT NULL DEFAULT false;

