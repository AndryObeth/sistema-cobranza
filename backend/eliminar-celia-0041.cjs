require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cliente = await prisma.cliente.findFirst({
    where: { numero_expediente: '0041' },
    include: {
      ventas:  { include: { cuenta: true } },
      cuentas: true,
      pagos:   true,
    }
  })

  if (!cliente) { console.log('❌ No se encontró expediente 0041'); return }

  console.log('Cliente a eliminar:', cliente.nombre, '— ID:', cliente.id_cliente)
  console.log('Ventas:', cliente.ventas.length)
  cliente.ventas.forEach(v => console.log(`  · Venta ${v.id_venta} — cuenta: ${v.cuenta?.numero_cuenta || v.cuenta?.folio_cuenta}`))
  console.log('Cuentas:', cliente.cuentas.length)
  console.log('Pagos:', cliente.pagos.length)

  await prisma.$transaction(async (tx) => {
    await tx.detalleVenta.deleteMany({
      where: { venta: { id_cliente: cliente.id_cliente } }
    })
    await tx.pago.deleteMany({ where: { id_cliente: cliente.id_cliente } })
    await tx.seguimientoCliente.deleteMany({ where: { id_cliente: cliente.id_cliente } })
    await tx.cuenta.deleteMany({ where: { id_cliente: cliente.id_cliente } })
    await tx.venta.deleteMany({ where: { id_cliente: cliente.id_cliente } })
    await tx.cliente.delete({ where: { id_cliente: cliente.id_cliente } })
  })

  console.log('\n✅ Expediente 0041 (duplicado) eliminado correctamente.')
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
