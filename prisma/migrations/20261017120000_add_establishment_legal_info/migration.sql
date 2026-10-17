-- Mentions légales facultatives de l'établissement (en-tête des factures)
-- AlterTable
ALTER TABLE "establishments" ADD COLUMN     "nif" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postal_box" TEXT,
ADD COLUMN     "rc" TEXT;

