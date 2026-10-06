-- CreateEnum
CREATE TYPE "TipoCambioCliente" AS ENUM ('ruta', 'numero_cuenta', 'producto', 'plan', 'traspaso_cuenta', 'otro');

-- CreateTable
CREATE TABLE "cambios_cliente" (
    "id_cambio" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "tipo_cambio" "TipoCambioCliente" NOT NULL,
    "numero_cuenta" TEXT,
    "descripcion" TEXT NOT NULL,
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "fecha_cambio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por" TEXT,

    CONSTRAINT "cambios_cliente_pkey" PRIMARY KEY ("id_cambio")
);

-- AddForeignKey
ALTER TABLE "cambios_cliente" ADD CONSTRAINT "cambios_cliente_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
