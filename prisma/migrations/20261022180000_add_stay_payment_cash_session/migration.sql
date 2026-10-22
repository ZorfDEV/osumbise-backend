-- AlterTable
ALTER TABLE "stay_payments" ADD COLUMN     "cash_session_id" TEXT;

-- AddForeignKey
ALTER TABLE "stay_payments" ADD CONSTRAINT "stay_payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

