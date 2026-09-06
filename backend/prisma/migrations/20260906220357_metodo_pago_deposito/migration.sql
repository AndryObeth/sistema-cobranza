-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('efectivo', 'deposito');

-- AlterTable
ALTER TABLE "cortes_cobrador" ADD COLUMN     "total_deposito" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'efectivo';

-- CreateTable
CREATE TABLE "comprobantes_pago" (
    "id_comprobante" SERIAL NOT NULL,
    "id_pago" INTEGER NOT NULL,
    "imagen" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pago_pkey" PRIMARY KEY ("id_comprobante")
);

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_pago_id_pago_key" ON "comprobantes_pago"("id_pago");

-- AddForeignKey
ALTER TABLE "comprobantes_pago" ADD CONSTRAINT "comprobantes_pago_id_pago_fkey" FOREIGN KEY ("id_pago") REFERENCES "pagos"("id_pago") ON DELETE CASCADE ON UPDATE CASCADE;
