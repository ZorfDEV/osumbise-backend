-- Paiement rattaché à la session de caisse (détail des factures au rapport de clôture)
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cash_session_id" TEXT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

