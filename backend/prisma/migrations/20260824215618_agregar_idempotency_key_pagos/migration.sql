-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pagos_idempotency_key_key" ON "pagos"("idempotency_key");
