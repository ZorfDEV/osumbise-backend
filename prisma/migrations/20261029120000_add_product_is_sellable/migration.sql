-- Produit vendu en caisse ; false pour un ingrédient (huile, spaghettis...)
-- utilisé seulement dans les recettes. Tous les produits existants restent vendus
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_sellable" BOOLEAN NOT NULL DEFAULT true;
