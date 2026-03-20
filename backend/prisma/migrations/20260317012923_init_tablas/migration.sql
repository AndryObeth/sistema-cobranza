-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('administrador', 'secretaria', 'vendedor', 'cobrador');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('activo', 'moroso', 'bloqueado', 'inactivo');

-- CreateEnum
CREATE TYPE "NivelRiesgo" AS ENUM ('bajo', 'medio', 'alto');

-- CreateEnum
CREATE TYPE "EstatusProducto" AS ENUM ('activo', 'inactivo', 'descontinuado');

-- CreateEnum
CREATE TYPE "TipoVenta" AS ENUM ('contado', 'plazo');

-- CreateEnum
CREATE TYPE "PlanVenta" AS ENUM ('contado_directo', 'un_mes', 'dos_meses', 'tres_meses', 'largo_plazo');

-- CreateEnum
CREATE TYPE "EstatusVenta" AS ENUM ('activa', 'cancelada', 'liquidada');

-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('activa', 'atraso', 'moroso', 'liquidada', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoPago" AS ENUM ('abono', 'liquidacion', 'recuperacion_enganche', 'pago_extra');

-- CreateEnum
CREATE TYPE "TipoSeguimiento" AS ENUM ('visita', 'promesa_pago', 'no_localizado', 'casa_cerrada', 'se_nego', 'observacion_general');

-- CreateEnum
CREATE TYPE "EstadoComisionVendedor" AS ENUM ('completa_inmediata', 'parcial', 'pendiente_recuperacion', 'lista_para_corte', 'pagada');

-- CreateEnum
CREATE TYPE "EstadoCorteRecuperacion" AS ENUM ('pendiente_corte', 'incluido_en_corte', 'pagado');

-- CreateEnum
CREATE TYPE "EstadoCorte" AS ENUM ('abierto', 'revisado', 'cerrado', 'pagado');

-- CreateEnum
CREATE TYPE "TipoCorteVendedor" AS ENUM ('cinco', 'veinte');

-- CreateTable
CREATE TABLE "usuarios" (
    "id_usuario" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "contrasena" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "ruta_asignada" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id_cliente" SERIAL NOT NULL,
    "numero_cuenta" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alias" TEXT,
    "telefono" TEXT,
    "municipio" TEXT,
    "colonia" TEXT,
    "direccion" TEXT,
    "referencias" TEXT,
    "ruta" TEXT,
    "fecha_alta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_vendedor_alta" INTEGER,
    "estado_cliente" "EstadoCliente" NOT NULL DEFAULT 'activo',
    "nivel_riesgo" "NivelRiesgo",
    "recomendacion_operativa" TEXT,
    "observaciones_generales" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id_cliente")
);

-- CreateTable
CREATE TABLE "productos" (
    "id_producto" SERIAL NOT NULL,
    "codigo_producto" TEXT NOT NULL,
    "categoria" TEXT,
    "subcategoria" TEXT,
    "material" TEXT,
    "nombre_comercial" TEXT NOT NULL,
    "nombre_interno" TEXT,
    "marca" TEXT,
    "precio_original" DECIMAL(10,2) NOT NULL,
    "precio_credito" DECIMAL(10,2),
    "aplica_2_meses" BOOLEAN NOT NULL DEFAULT false,
    "pago_semanal_2_meses" DECIMAL(10,2),
    "precio_2_meses" DECIMAL(10,2),
    "aplica_3_meses" BOOLEAN NOT NULL DEFAULT false,
    "pago_semanal_3_meses" DECIMAL(10,2),
    "precio_3_meses" DECIMAL(10,2),
    "abono_semanal_largo" DECIMAL(10,2),
    "estatus" "EstatusProducto" NOT NULL DEFAULT 'activo',
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id_producto")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id_venta" SERIAL NOT NULL,
    "folio_venta" TEXT NOT NULL,
    "fecha_venta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_cliente" INTEGER NOT NULL,
    "id_vendedor" INTEGER NOT NULL,
    "id_cobrador" INTEGER,
    "ruta" TEXT,
    "tipo_venta" "TipoVenta" NOT NULL,
    "plan_venta" "PlanVenta" NOT NULL,
    "precio_original_total" DECIMAL(10,2) NOT NULL,
    "precio_final_total" DECIMAL(10,2) NOT NULL,
    "enganche_recibido_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "enganche_objetivo_vendedor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "enganche_para_vendedor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "enganche_regado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sobreenganche" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monto_reportado_negocio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "utilidad_vendedor_contado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "estatus_venta" "EstatusVenta" NOT NULL DEFAULT 'activa',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id_venta")
);

-- CreateTable
CREATE TABLE "detalle_venta" (
    "id_detalle_venta" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "codigo_producto" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_original_unitario" DECIMAL(10,2) NOT NULL,
    "precio_final_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal_original" DECIMAL(10,2) NOT NULL,
    "subtotal_final" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "detalle_venta_pkey" PRIMARY KEY ("id_detalle_venta")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id_cuenta" SERIAL NOT NULL,
    "folio_cuenta" TEXT NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "plan_inicial" "PlanVenta" NOT NULL,
    "plan_actual" "PlanVenta" NOT NULL,
    "precio_original_total" DECIMAL(10,2) NOT NULL,
    "precio_plan_actual" DECIMAL(10,2) NOT NULL,
    "abono_inicial" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo_inicial" DECIMAL(10,2) NOT NULL,
    "saldo_actual" DECIMAL(10,2) NOT NULL,
    "semanas_plazo" INTEGER NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_limite" TIMESTAMP(3),
    "beneficio_vigente" BOOLEAN NOT NULL DEFAULT true,
    "nivel_reestructura" INTEGER NOT NULL DEFAULT 0,
    "semanas_atraso" INTEGER NOT NULL DEFAULT 0,
    "fecha_ultimo_pago" TIMESTAMP(3),
    "estado_cuenta" "EstadoCuenta" NOT NULL DEFAULT 'activa',
    "observaciones" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id_cuenta")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id_pago" SERIAL NOT NULL,
    "id_cuenta" INTEGER NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_cobrador" INTEGER NOT NULL,
    "fecha_pago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto_pago" DECIMAL(10,2) NOT NULL,
    "saldo_anterior" DECIMAL(10,2) NOT NULL,
    "saldo_nuevo" DECIMAL(10,2) NOT NULL,
    "tipo_pago" "TipoPago" NOT NULL,
    "aplica_a_enganche_regado" BOOLEAN NOT NULL DEFAULT false,
    "monto_aplicado_enganche_regado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monto_aplicado_saldo" DECIMAL(10,2) NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id_pago")
);

-- CreateTable
CREATE TABLE "seguimiento_cliente" (
    "id_seguimiento" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_cuenta" INTEGER,
    "id_usuario" INTEGER NOT NULL,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_seguimiento" "TipoSeguimiento" NOT NULL,
    "comentario" TEXT,

    CONSTRAINT "seguimiento_cliente_pkey" PRIMARY KEY ("id_seguimiento")
);

-- CreateTable
CREATE TABLE "utilidades_contado" (
    "id_utilidad_contado" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "id_vendedor" INTEGER NOT NULL,
    "precio_original" DECIMAL(10,2) NOT NULL,
    "precio_contado" DECIMAL(10,2) NOT NULL,
    "monto_reportado_negocio" DECIMAL(10,2) NOT NULL,
    "utilidad_vendedor" DECIMAL(10,2) NOT NULL,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilidades_contado_pkey" PRIMARY KEY ("id_utilidad_contado")
);

-- CreateTable
CREATE TABLE "comisiones_vendedor" (
    "id_comision_vendedor" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "id_vendedor" INTEGER NOT NULL,
    "porcentaje_comision" DECIMAL(5,2) NOT NULL,
    "comision_objetivo" DECIMAL(10,2) NOT NULL,
    "enganche_cobrado_inicial" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "enganche_regado_pendiente" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monto_recuperado_para_vendedor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monto_pagado_en_corte" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado_comision" "EstadoComisionVendedor" NOT NULL DEFAULT 'pendiente_recuperacion',
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comisiones_vendedor_pkey" PRIMARY KEY ("id_comision_vendedor")
);

-- CreateTable
CREATE TABLE "comisiones_cobrador" (
    "id_comision_cobrador" SERIAL NOT NULL,
    "id_pago" INTEGER NOT NULL,
    "id_cobrador" INTEGER NOT NULL,
    "monto_cobrado" DECIMAL(10,2) NOT NULL,
    "porcentaje_comision" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "comision_generada" DECIMAL(10,2) NOT NULL,
    "fecha_registro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "semana_corte" TEXT,

    CONSTRAINT "comisiones_cobrador_pkey" PRIMARY KEY ("id_comision_cobrador")
);

-- CreateTable
CREATE TABLE "recuperacion_enganche_regado" (
    "id_recuperacion" SERIAL NOT NULL,
    "id_venta" INTEGER NOT NULL,
    "id_pago" INTEGER NOT NULL,
    "id_vendedor" INTEGER NOT NULL,
    "id_cobrador" INTEGER NOT NULL,
    "monto_recuperado" DECIMAL(10,2) NOT NULL,
    "comision_cobrador" DECIMAL(10,2) NOT NULL,
    "monto_neto_vendedor" DECIMAL(10,2) NOT NULL,
    "fecha_recuperacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado_corte" "EstadoCorteRecuperacion" NOT NULL DEFAULT 'pendiente_corte',

    CONSTRAINT "recuperacion_enganche_regado_pkey" PRIMARY KEY ("id_recuperacion")
);

-- CreateTable
CREATE TABLE "cortes_cobrador" (
    "id_corte_cobrador" SERIAL NOT NULL,
    "id_cobrador" INTEGER NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "total_cobrado" DECIMAL(10,2) NOT NULL,
    "total_depositado" DECIMAL(10,2) NOT NULL,
    "diferencia" DECIMAL(10,2) NOT NULL,
    "comision_total" DECIMAL(10,2) NOT NULL,
    "estado_corte" "EstadoCorte" NOT NULL DEFAULT 'abierto',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cortes_cobrador_pkey" PRIMARY KEY ("id_corte_cobrador")
);

-- CreateTable
CREATE TABLE "detalle_corte_cobrador" (
    "id_detalle_corte_cobrador" SERIAL NOT NULL,
    "id_corte_cobrador" INTEGER NOT NULL,
    "id_pago" INTEGER NOT NULL,
    "monto_pago" DECIMAL(10,2) NOT NULL,
    "comision_generada" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "detalle_corte_cobrador_pkey" PRIMARY KEY ("id_detalle_corte_cobrador")
);

-- CreateTable
CREATE TABLE "cortes_vendedor" (
    "id_corte_vendedor" SERIAL NOT NULL,
    "fecha_corte" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_corte" "TipoCorteVendedor" NOT NULL,
    "id_vendedor" INTEGER NOT NULL,
    "total_pagado" DECIMAL(10,2) NOT NULL,
    "estado_corte" "EstadoCorte" NOT NULL DEFAULT 'abierto',
    "observaciones" TEXT,

    CONSTRAINT "cortes_vendedor_pkey" PRIMARY KEY ("id_corte_vendedor")
);

-- CreateTable
CREATE TABLE "detalle_corte_vendedor" (
    "id_detalle_corte_vendedor" SERIAL NOT NULL,
    "id_corte_vendedor" INTEGER NOT NULL,
    "id_recuperacion" INTEGER NOT NULL,
    "monto_pagado" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "detalle_corte_vendedor_pkey" PRIMARY KEY ("id_detalle_corte_vendedor")
);

-- CreateTable
CREATE TABLE "configuracion_negocio" (
    "id_configuracion" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "configuracion_negocio_pkey" PRIMARY KEY ("id_configuracion")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_numero_cuenta_key" ON "clientes"("numero_cuenta");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_producto_key" ON "productos"("codigo_producto");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_folio_venta_key" ON "ventas"("folio_venta");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_folio_cuenta_key" ON "cuentas"("folio_cuenta");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_id_venta_key" ON "cuentas"("id_venta");

-- CreateIndex
CREATE UNIQUE INDEX "utilidades_contado_id_venta_key" ON "utilidades_contado"("id_venta");

-- CreateIndex
CREATE UNIQUE INDEX "comisiones_vendedor_id_venta_key" ON "comisiones_vendedor"("id_venta");

-- CreateIndex
CREATE UNIQUE INDEX "comisiones_cobrador_id_pago_key" ON "comisiones_cobrador"("id_pago");

-- CreateIndex
CREATE UNIQUE INDEX "recuperacion_enganche_regado_id_pago_key" ON "recuperacion_enganche_regado"("id_pago");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_negocio_clave_key" ON "configuracion_negocio"("clave");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_id_vendedor_alta_fkey" FOREIGN KEY ("id_vendedor_alta") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_vendedor_fkey" FOREIGN KEY ("id_vendedor") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_id_cobrador_fkey" FOREIGN KEY ("id_cobrador") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_id_cuenta_fkey" FOREIGN KEY ("id_cuenta") REFERENCES "cuentas"("id_cuenta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_id_cobrador_fkey" FOREIGN KEY ("id_cobrador") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento_cliente" ADD CONSTRAINT "seguimiento_cliente_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento_cliente" ADD CONSTRAINT "seguimiento_cliente_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilidades_contado" ADD CONSTRAINT "utilidades_contado_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilidades_contado" ADD CONSTRAINT "utilidades_contado_id_vendedor_fkey" FOREIGN KEY ("id_vendedor") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones_vendedor" ADD CONSTRAINT "comisiones_vendedor_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones_vendedor" ADD CONSTRAINT "comisiones_vendedor_id_vendedor_fkey" FOREIGN KEY ("id_vendedor") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones_cobrador" ADD CONSTRAINT "comisiones_cobrador_id_pago_fkey" FOREIGN KEY ("id_pago") REFERENCES "pagos"("id_pago") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comisiones_cobrador" ADD CONSTRAINT "comisiones_cobrador_id_cobrador_fkey" FOREIGN KEY ("id_cobrador") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacion_enganche_regado" ADD CONSTRAINT "recuperacion_enganche_regado_id_venta_fkey" FOREIGN KEY ("id_venta") REFERENCES "ventas"("id_venta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacion_enganche_regado" ADD CONSTRAINT "recuperacion_enganche_regado_id_pago_fkey" FOREIGN KEY ("id_pago") REFERENCES "pagos"("id_pago") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_cobrador" ADD CONSTRAINT "cortes_cobrador_id_cobrador_fkey" FOREIGN KEY ("id_cobrador") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_corte_cobrador" ADD CONSTRAINT "detalle_corte_cobrador_id_corte_cobrador_fkey" FOREIGN KEY ("id_corte_cobrador") REFERENCES "cortes_cobrador"("id_corte_cobrador") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_corte_cobrador" ADD CONSTRAINT "detalle_corte_cobrador_id_pago_fkey" FOREIGN KEY ("id_pago") REFERENCES "pagos"("id_pago") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cortes_vendedor" ADD CONSTRAINT "cortes_vendedor_id_vendedor_fkey" FOREIGN KEY ("id_vendedor") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_corte_vendedor" ADD CONSTRAINT "detalle_corte_vendedor_id_corte_vendedor_fkey" FOREIGN KEY ("id_corte_vendedor") REFERENCES "cortes_vendedor"("id_corte_vendedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_corte_vendedor" ADD CONSTRAINT "detalle_corte_vendedor_id_recuperacion_fkey" FOREIGN KEY ("id_recuperacion") REFERENCES "recuperacion_enganche_regado"("id_recuperacion") ON DELETE RESTRICT ON UPDATE CASCADE;
