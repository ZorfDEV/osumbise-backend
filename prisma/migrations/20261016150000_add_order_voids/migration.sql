-- Journal des annulations de commande et articles retirés (avec motif)
-- CreateEnum
CREATE TYPE "OrderVoidType" AS ENUM ('ITEM', 'ORDER');

-- CreateTable
CREATE TABLE "order_voids" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "OrderVoidType" NOT NULL,
    "product_name" TEXT,
    "quantity" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "was_prepared" BOOLEAN NOT NULL DEFAULT false,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_voids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_voids_order_id_idx" ON "order_voids"("order_id");

-- AddForeignKey
ALTER TABLE "order_voids" ADD CONSTRAINT "order_voids_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_voids" ADD CONSTRAINT "order_voids_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

