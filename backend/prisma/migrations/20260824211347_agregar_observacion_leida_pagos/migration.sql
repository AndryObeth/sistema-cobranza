-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "observacion_leida" BOOLEAN NOT NULL DEFAULT false;

-- Los comentarios existentes son historicos, no deben aparecer como "no leidos"
-- de golpe al activar la funcion; solo los comentarios nuevos cuentan.
UPDATE "pagos" SET "observacion_leida" = true;
