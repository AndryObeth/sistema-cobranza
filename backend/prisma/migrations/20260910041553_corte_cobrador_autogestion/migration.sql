-- AlterEnum
ALTER TYPE "EstadoCorte" ADD VALUE 'en_revision';

-- AlterTable
ALTER TABLE "cortes_cobrador" ADD COLUMN     "cerrado_por" INTEGER;
