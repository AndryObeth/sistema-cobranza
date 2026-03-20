-- CreateEnum
CREATE TYPE "OrigenPago" AS ENUM ('domicilio', 'calle', 'oficina');

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "origen_pago" "OrigenPago" NOT NULL DEFAULT 'domicilio';

-- AlterTable
ALTER TABLE "seguimiento_cliente" ADD COLUMN     "fecha_programada" TIMESTAMP(3);
