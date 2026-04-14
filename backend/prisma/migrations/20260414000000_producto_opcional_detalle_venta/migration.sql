-- Permitir productos especiales (sin catálogo) en detalle_venta
ALTER TABLE "detalle_venta" ALTER COLUMN "id_producto" DROP NOT NULL;
