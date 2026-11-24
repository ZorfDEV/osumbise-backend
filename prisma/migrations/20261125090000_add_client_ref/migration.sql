-- Identifiant donné par l'appareil : une commande ou un article renvoyé (réponse
-- perdue, reprise hors connexion) n'est enregistré qu'une fois
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "client_ref" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "client_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_client_ref_key" ON "orders"("client_ref");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_client_ref_key" ON "order_items"("client_ref");
