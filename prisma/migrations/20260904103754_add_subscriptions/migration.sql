-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[];
