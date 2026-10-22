-- Réserve (magasin) et stock de vente ; déstockage et correction d'entrée
-- CreateEnum
CREATE TYPE "StockLocation" AS ENUM ('SALES', 'RESERVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFERT';
ALTER TYPE "StockMovementType" ADD VALUE 'CORRECTION';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "stock_reserve" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "corrects_movement_id" TEXT,
ADD COLUMN     "location" "StockLocation" NOT NULL DEFAULT 'SALES';

