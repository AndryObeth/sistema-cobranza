-- AlterTable: agregar jefe_camioneta a ventas
ALTER TABLE "ventas" ADD COLUMN "id_jefe_camioneta" INTEGER;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_jefe_camioneta_fkey"
  FOREIGN KEY ("id_jefe_camioneta") REFERENCES "usuarios"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;
