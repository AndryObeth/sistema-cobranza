-- AlterTable
ALTER TABLE "lista_negra" ADD COLUMN     "id_cliente" INTEGER,
ADD COLUMN     "numero_cuenta" TEXT,
ADD COLUMN     "saldo_pendiente" DECIMAL(10,2),
ADD COLUMN     "ultimo_abono_monto" DECIMAL(10,2),
ADD COLUMN     "ultimo_abono_fecha" TIMESTAMP(3);
