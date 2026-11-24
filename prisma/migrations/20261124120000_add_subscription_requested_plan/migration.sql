-- Formule plus chère demandée en cours de période payée, en attente de
-- validation par l'administrateur de la plateforme
-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "requested_plan_id" TEXT,
ADD COLUMN     "requested_plan_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_requested_plan_id_fkey" FOREIGN KEY ("requested_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
