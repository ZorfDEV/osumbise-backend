-- Nom de la personne qui a encaissé la commande (ticket)
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_by_name" TEXT;

