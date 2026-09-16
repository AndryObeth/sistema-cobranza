-- CreateEnum
CREATE TYPE "EstadoVerificacionCuenta" AS ENUM ('pendiente_visita', 'en_revision_admin', 'aprobada', 'rechazada');

-- AlterTable
ALTER TABLE "cuentas" ADD COLUMN     "estado_verificacion" "EstadoVerificacionCuenta" NOT NULL DEFAULT 'pendiente_visita',
ADD COLUMN     "fecha_aprobacion" TIMESTAMP(3),
ADD COLUMN     "fecha_primera_visita" TIMESTAMP(3),
ADD COLUMN     "id_admin_aprobacion" INTEGER,
ADD COLUMN     "id_supervisor_visita" INTEGER,
ADD COLUMN     "notas_aprobacion_admin" TEXT,
ADD COLUMN     "notas_primera_visita" TEXT;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_id_supervisor_visita_fkey" FOREIGN KEY ("id_supervisor_visita") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_id_admin_aprobacion_fkey" FOREIGN KEY ("id_admin_aprobacion") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: las cuentas que YA existían antes de esta función quedan como
-- "aprobadas" (ya estaban en la calle, cobrables) — el filtro de "pendiente
-- de primera visita" solo aplica a cuentas creadas de aquí en adelante,
-- que sí nacen con el DEFAULT 'pendiente_visita' de la columna.
UPDATE "cuentas" SET "estado_verificacion" = 'aprobada';
