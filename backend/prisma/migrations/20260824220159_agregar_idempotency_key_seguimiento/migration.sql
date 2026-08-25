-- AlterTable
ALTER TABLE "seguimiento_cliente" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "seguimiento_cliente_idempotency_key_key" ON "seguimiento_cliente"("idempotency_key");
