-- Séjour rattaché à un client enregistré (compte client)
-- AlterTable
ALTER TABLE "stays" ADD COLUMN     "customer_id" TEXT;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

