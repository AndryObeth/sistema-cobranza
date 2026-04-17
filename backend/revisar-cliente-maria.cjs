require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const clientes = await prisma.cliente.findMany({
    where: { nombre: { contains: 'Maria Isabel Vazquez', mode: 'insensitive' } },
    include: {
      ventas:  { include: { cuenta: true } },
      cuentas: true,
      pagos:   true,
    }
  })

  if (clientes.length === 0) { console.log('❌ No se encontró el cliente'); return }

  for (const c of clientes) {
    console.log('══════════════════════════════════════')
    console.log('Cliente:', c.nombre)
    console.log('ID:', c.id_cliente)
    console.log('Expediente:', c.numero_expediente)
    console.log('Ventas:', c.ventas.length)
    c.ventas.forEach(v => {
      console.log(`  · Venta ${v.id_venta} — cuenta: ${v.cuenta?.numero_cuenta || v.cuenta?.folio_cuenta} — estado: ${v.cuenta?.estado_cuenta}`)
    })
    console.log('Cuentas:', c.cuentas.length)
    c.cuentas.forEach(cu => {
      console.log(`  · ${cu.numero_cuenta || cu.folio_cuenta} — saldo: $${parseFloat(cu.saldo_actual)} — estado: ${cu.estado_cuenta}`)
    })
    console.log('Pagos registrados:', c.pagos.length)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
