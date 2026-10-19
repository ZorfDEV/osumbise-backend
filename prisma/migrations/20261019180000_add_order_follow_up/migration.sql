-- Commande qui fait suite à une facture déjà payée (même client)
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "follows_order_id" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_follows_order_id_fkey" FOREIGN KEY ("follows_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

