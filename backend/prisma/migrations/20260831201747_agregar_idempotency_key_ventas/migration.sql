-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ventas_idempotency_key_key" ON "ventas"("idempotency_key");
