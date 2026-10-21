-- Caisse verrouillable par le propriétaire ; fin de service prévue d'une session
-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "locked_reason" TEXT;

-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "planned_close_at" TIMESTAMP(3);

