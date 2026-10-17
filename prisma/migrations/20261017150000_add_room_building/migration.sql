-- Bâtiment de la chambre (facultatif) : même numéro possible dans deux bâtiments
-- DropIndex
DROP INDEX "rooms_establishment_id_number_key";

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "building" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "rooms_establishment_id_building_number_key" ON "rooms"("establishment_id", "building", "number");

