-- CreateEnum
CREATE TYPE "DiaCobranza" AS ENUM ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "dia_cobranza" "DiaCobranza";
