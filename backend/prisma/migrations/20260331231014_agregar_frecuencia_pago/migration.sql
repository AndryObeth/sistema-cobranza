-- CreateEnum
CREATE TYPE "FrecuenciaPago" AS ENUM ('semanal', 'quincenal', 'mensual', 'dos_meses');

-- AlterTable
ALTER TABLE "cuentas" ADD COLUMN     "fecha_primer_cobro" TIMESTAMP(3),
ADD COLUMN     "frecuencia_pago" "FrecuenciaPago" NOT NULL DEFAULT 'semanal',
ADD COLUMN     "horario_preferido" TEXT;
