-- AlterTable
ALTER TABLE "products" ADD COLUMN     "side_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "side_product_id" TEXT;

-- CreateTable
CREATE TABLE "product_sides" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "side_product_id" TEXT NOT NULL,

    CONSTRAINT "product_sides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_sides_product_id_side_product_id_key" ON "product_sides"("product_id", "side_product_id");

-- AddForeignKey
ALTER TABLE "product_sides" ADD CONSTRAINT "product_sides_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sides" ADD CONSTRAINT "product_sides_side_product_id_fkey" FOREIGN KEY ("side_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_side_product_id_fkey" FOREIGN KEY ("side_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

