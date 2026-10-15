-- CreateEnum
CREATE TYPE "RoomCategory" AS ENUM ('STANDARD', 'VIP', 'SUITE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "StayStatus" AS ENUM ('RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ROOM';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "stay_id" TEXT;

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "category" "RoomCategory" NOT NULL DEFAULT 'STANDARD',
    "floor" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "nightly_rate" DECIMAL(12,2) NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_category_taxes" (
    "id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "category" "RoomCategory" NOT NULL,
    "tax_per_night" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_category_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stays" (
    "id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_phone" TEXT,
    "guest_id_number" TEXT,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "nightly_rate" DECIMAL(12,2) NOT NULL,
    "tax_per_night" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "StayStatus" NOT NULL DEFAULT 'RESERVED',
    "notes" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stay_payments" (
    "id" TEXT NOT NULL,
    "stay_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stay_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_establishment_id_number_key" ON "rooms"("establishment_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "room_category_taxes_establishment_id_category_key" ON "room_category_taxes"("establishment_id", "category");

-- CreateIndex
CREATE INDEX "stays_establishment_id_check_in_date_idx" ON "stays"("establishment_id", "check_in_date");

-- CreateIndex
CREATE INDEX "stays_room_id_status_idx" ON "stays"("room_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_category_taxes" ADD CONSTRAINT "room_category_taxes_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "establishments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_payments" ADD CONSTRAINT "stay_payments_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay_payments" ADD CONSTRAINT "stay_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

