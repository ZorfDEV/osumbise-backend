-- Numéro de facture séquentiel par établissement (affiché 0001, 0002…)

-- AlterTable
ALTER TABLE "establishments" ADD COLUMN     "next_invoice_number" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "number" INTEGER;

-- Commandes existantes : numérotées dans l'ordre de création, par établissement
UPDATE "orders" AS o
SET "number" = s.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "establishment_id" ORDER BY "created_at", "id") AS rn
  FROM "orders"
) AS s
WHERE o."id" = s."id";

-- Le compteur de chaque établissement reprend après le dernier numéro attribué
UPDATE "establishments" AS e
SET "next_invoice_number" = COALESCE((SELECT MAX(o."number") FROM "orders" o WHERE o."establishment_id" = e."id"), 0) + 1;

-- CreateIndex
CREATE UNIQUE INDEX "orders_establishment_id_number_key" ON "orders"("establishment_id", "number");
