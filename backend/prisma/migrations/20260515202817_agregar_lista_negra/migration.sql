-- CreateTable
CREATE TABLE "lista_negra" (
    "id_lista_negra" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "alias" TEXT,
    "telefono" TEXT,
    "municipio" TEXT,
    "colonia" TEXT,
    "motivo" TEXT NOT NULL,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_usuario_registro" INTEGER NOT NULL,

    CONSTRAINT "lista_negra_pkey" PRIMARY KEY ("id_lista_negra")
);

-- AddForeignKey
ALTER TABLE "lista_negra" ADD CONSTRAINT "lista_negra_id_usuario_registro_fkey" FOREIGN KEY ("id_usuario_registro") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
