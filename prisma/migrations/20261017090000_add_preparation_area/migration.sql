-- Produits préparés en cuisine (plats) ou au bar (boissons servies par le serveur)
-- CreateEnum
CREATE TYPE "PreparationArea" AS ENUM ('KITCHEN', 'BAR');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "preparation_area" "PreparationArea" NOT NULL DEFAULT 'KITCHEN';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "preparation_area" "PreparationArea" NOT NULL DEFAULT 'KITCHEN';

