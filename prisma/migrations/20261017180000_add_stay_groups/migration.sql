-- Réservations de groupe : plusieurs chambres au nom d'une entreprise, facture unique
-- AlterTable
ALTER TABLE "stays" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "stay_groups" (
    "id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_id" TEXT,
    "contact_phone" TEXT,
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stay_groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "stay_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_groups" ADD CONSTRAINT "stay_groups_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_groups" ADD CONSTRAINT "stay_groups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_groups" ADD CONSTRAINT "stay_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

