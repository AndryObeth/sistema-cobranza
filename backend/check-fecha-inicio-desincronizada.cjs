// Diagnóstico: cuentas cuyo fecha_inicio no coincide con la fecha_venta real
// de su venta — pasa cuando la venta se registra con fecha retroactiva
// (clientes migrados, captura tardía) porque fecha_inicio usaba el default
// now() de Prisma al crear la fila, en vez de la fecha_venta ya elegida.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuentas = await prisma.cuenta.findMany({
    include: {
      cliente: { select: { nombre: true } },
      venta: { select: { fecha_venta: true } },
    },
  })

  const afectadas = cuentas.filter(c => {
    const diffDias = Math.abs(new Date(c.fecha_inicio) - new Date(c.venta.fecha_venta)) / (24*60*60*1000)
    return diffDias > 1
  })

  console.log(`Total cuentas: ${cuentas.length}`)
  console.log(`Cuentas con fecha_inicio desincronizada de fecha_venta (>1 día): ${afectadas.length}\n`)

  for (const c of afectadas) {
    console.log(`#${c.id_cuenta} ${c.numero_cuenta || c.folio_cuenta} — ${c.cliente.nombre}`)
    console.log(`  plan_inicial=${c.plan_inicial} nivel_reestructura=${c.nivel_reestructura} estado=${c.estado_cuenta}`)
    console.log(`  fecha_inicio actual: ${c.fecha_inicio.toISOString()}`)
    console.log(`  fecha_venta real:    ${c.venta.fecha_venta.toISOString()}`)
    console.log('')
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
