-- AlterEnum
ALTER TYPE "RolUsuario" ADD VALUE 'supervisor_cobranza';

-- DropForeignKey
ALTER TABLE "detalle_venta" DROP CONSTRAINT "detalle_venta_id_producto_fkey";

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "clientes_numero_cuenta_key" RENAME TO "clientes_numero_expediente_key";
