-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "ultima_lat" DOUBLE PRECISION,
ADD COLUMN     "ultima_lng" DOUBLE PRECISION,
ADD COLUMN     "ultima_ubicacion_fecha" TIMESTAMP(3);
