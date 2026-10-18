-- Prestations de l'hôtel (pressing, room service…) ajoutées à la facture d'un séjour
-- CreateTable
CREATE TABLE "hotel_services" (
    "id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Pressing',
    "price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stay_charges" (
    "id" TEXT NOT NULL,
    "stay_id" TEXT NOT NULL,
    "service_id" TEXT,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stay_charges_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "hotel_services" ADD CONSTRAINT "hotel_services_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_charges" ADD CONSTRAINT "stay_charges_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_charges" ADD CONSTRAINT "stay_charges_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "hotel_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_charges" ADD CONSTRAINT "stay_charges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

