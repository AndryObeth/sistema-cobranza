-- Renombrar numero_cuenta → numero_expediente en clientes
ALTER TABLE "clientes" RENAME COLUMN "numero_cuenta" TO "numero_expediente";

-- Agregar numero_cuenta (folio físico del negocio) en cuentas
ALTER TABLE "cuentas" ADD COLUMN "numero_cuenta" TEXT;
