-- Séjour (ou part de séjour) mis sur un compte client (méthode CREDIT)
-- AlterTable
ALTER TABLE "stay_payments" ADD COLUMN     "customer_id" TEXT;

-- AddForeignKey
ALTER TABLE "stay_payments" ADD CONSTRAINT "stay_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
