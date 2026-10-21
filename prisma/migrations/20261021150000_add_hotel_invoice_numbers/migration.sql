-- Numéros des factures de l'hôtel (H0001…), une suite par établissement,
-- commune aux séjours et aux réservations de groupe

-- AlterTable
ALTER TABLE "establishments" ADD COLUMN     "next_hotel_invoice_number" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "stays" ADD COLUMN     "number" INTEGER;

-- AlterTable
ALTER TABLE "stay_groups" ADD COLUMN     "number" INTEGER;

-- Séjours et groupes existants : numérotés ensemble dans l'ordre de création
WITH all_invoices AS (
  SELECT "id", "establishment_id", "created_at", 'S' AS kind FROM "stays"
  UNION ALL
  SELECT "id", "establishment_id", "created_at", 'G' AS kind FROM "stay_groups"
), numbered AS (
  SELECT "id", kind, ROW_NUMBER() OVER (PARTITION BY "establishment_id" ORDER BY "created_at", "id") AS rn
  FROM all_invoices
)
UPDATE "stays" AS s SET "number" = n.rn FROM numbered n WHERE n.kind = 'S' AND s."id" = n."id";

WITH all_invoices AS (
  SELECT "id", "establishment_id", "created_at", 'S' AS kind FROM "stays"
  UNION ALL
  SELECT "id", "establishment_id", "created_at", 'G' AS kind FROM "stay_groups"
), numbered AS (
  SELECT "id", kind, ROW_NUMBER() OVER (PARTITION BY "establishment_id" ORDER BY "created_at", "id") AS rn
  FROM all_invoices
)
UPDATE "stay_groups" AS g SET "number" = n.rn FROM numbered n WHERE n.kind = 'G' AND g."id" = n."id";

-- Le compteur reprend après le dernier numéro attribué
UPDATE "establishments" AS e
SET "next_hotel_invoice_number" = COALESCE((
  SELECT MAX(x.number) FROM (
    SELECT "number" FROM "stays" WHERE "establishment_id" = e."id"
    UNION ALL
    SELECT "number" FROM "stay_groups" WHERE "establishment_id" = e."id"
  ) AS x
), 0) + 1;

-- CreateIndex
CREATE UNIQUE INDEX "stays_establishment_id_number_key" ON "stays"("establishment_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "stay_groups_establishment_id_number_key" ON "stay_groups"("establishment_id", "number");
