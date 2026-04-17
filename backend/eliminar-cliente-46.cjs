require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const ID_CLIENTE = 46

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1. Borrar detalles de venta
    await tx.detalleVenta.deleteMany({
      where: { venta: { id_cliente: ID_CLIENTE } }
    })
    console.log('✅ Detalles de venta eliminados')

    // 2. Borrar pagos
    await tx.pago.deleteMany({ where: { id_cliente: ID_CLIENTE } })
    console.log('✅ Pagos eliminados')

    // 3. Borrar visitas/seguimientos
    await tx.seguimientoCliente.deleteMany({ where: { id_cliente: ID_CLIENTE } })
    console.log('✅ Visitas eliminadas')

    // 4. Borrar cuentas
    await tx.cuenta.deleteMany({ where: { id_cliente: ID_CLIENTE } })
    console.log('✅ Cuentas eliminadas')

    // 5. Borrar ventas
    await tx.venta.deleteMany({ where: { id_cliente: ID_CLIENTE } })
    console.log('✅ Ventas eliminadas')

    // 6. Borrar cliente
    await tx.cliente.delete({ where: { id_cliente: ID_CLIENTE } })
    console.log('✅ Cliente eliminado')
  })

  console.log('\n✅ Expediente de Maria Isabel Vazquez Sanchez eliminado completamente.')
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
