-- CreateEnum
CREATE TYPE "TipoMovimientoMayorista" AS ENUM ('cargo', 'abono');

-- CreateTable
CREATE TABLE "mayoristas" (
    "id_mayorista" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "notas" TEXT,
    "saldo_actual" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id_usuario_registro" INTEGER NOT NULL,

    CONSTRAINT "mayoristas_pkey" PRIMARY KEY ("id_mayorista")
);

-- CreateTable
CREATE TABLE "movimientos_mayoristas" (
    "id_movimiento" SERIAL NOT NULL,
    "id_mayorista" INTEGER NOT NULL,
    "tipo" "TipoMovimientoMayorista" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "saldo_anterior" DECIMAL(10,2) NOT NULL,
    "saldo_nuevo" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "id_usuario" INTEGER NOT NULL,

    CONSTRAINT "movimientos_mayoristas_pkey" PRIMARY KEY ("id_movimiento")
);

-- AddForeignKey
ALTER TABLE "mayoristas" ADD CONSTRAINT "mayoristas_id_usuario_registro_fkey" FOREIGN KEY ("id_usuario_registro") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_mayoristas" ADD CONSTRAINT "movimientos_mayoristas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_mayoristas" ADD CONSTRAINT "movimientos_mayoristas_id_mayorista_fkey" FOREIGN KEY ("id_mayorista") REFERENCES "mayoristas"("id_mayorista") ON DELETE RESTRICT ON UPDATE CASCADE;
