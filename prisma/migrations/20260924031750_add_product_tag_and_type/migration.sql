-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('VEGETARIEN', 'SANS_SUCRE', 'ALCOOLISE', 'MUSULMAN');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "tag" DECIMAL(5,2),
ADD COLUMN     "type" "ProductType";
