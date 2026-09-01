-- AlterTable
ALTER TABLE "ubicaciones_cliente" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_cliente_idempotency_key_key" ON "ubicaciones_cliente"("idempotency_key");
