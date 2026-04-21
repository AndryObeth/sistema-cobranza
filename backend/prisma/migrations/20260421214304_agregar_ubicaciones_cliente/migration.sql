-- CreateTable
CREATE TABLE "ubicaciones_cliente" (
    "id_ubicacion" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "nombre_contacto" TEXT,
    "descripcion" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "plus_code" TEXT,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ubicaciones_cliente_pkey" PRIMARY KEY ("id_ubicacion")
);

-- AddForeignKey
ALTER TABLE "ubicaciones_cliente" ADD CONSTRAINT "ubicaciones_cliente_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;
