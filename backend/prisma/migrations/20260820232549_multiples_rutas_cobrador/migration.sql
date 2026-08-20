-- Agregar columna de rutas multiples (array), conservando el dato existente de ruta_asignada
ALTER TABLE "usuarios" ADD COLUMN "rutas_asignadas" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "usuarios"
SET "rutas_asignadas" = ARRAY["ruta_asignada"]
WHERE "ruta_asignada" IS NOT NULL AND "ruta_asignada" <> '';

ALTER TABLE "usuarios" DROP COLUMN "ruta_asignada";
