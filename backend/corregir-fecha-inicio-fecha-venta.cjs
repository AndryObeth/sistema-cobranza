// Corrige Cuenta.fecha_inicio para que coincida con la fecha_venta real de su
// venta — antes fecha_inicio se guardaba con el default now() de Prisma (hora
// de captura en el sistema), que para ventas de fecha retroactiva (clientes
// migrados, captura tardía) quedaba muy adelantada respecto a la venta real.
// Esto hacía que la liquidación anticipada (GET /cuentas/:id/liquidacion-anticipada)
// calculara mal las "semanas transcurridas" y ofreciera el descuento a cuentas
// que ya estaban fuera de la ventana de 1/2/3 meses.
//
// El fix de código ya está aplicado en ventas.js para ventas nuevas; este
// script corrige las cuentas ya existentes.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const UN_DIA_MS = 24 * 60 * 60 * 1000

async function main() {
  const cuentas = await prisma.cuenta.findMany({
    include: { venta: { select: { fecha_venta: true } } },
  })

  const afectadas = cuentas.filter(c => Math.abs(new Date(c.fecha_inicio) - new Date(c.venta.fecha_venta)) > UN_DIA_MS)

  console.log(`Total cuentas: ${cuentas.length}`)
  console.log(`Cuentas a corregir (fecha_inicio != fecha_venta, diff > 1 día): ${afectadas.length}`)

  if (afectadas.length === 0) {
    console.log('Nada que corregir.')
    return
  }

  console.log('\nEjemplos (primeras 5):')
  for (const c of afectadas.slice(0, 5)) {
    console.log(`  #${c.id_cuenta} ${c.numero_cuenta || c.folio_cuenta}: fecha_inicio ${c.fecha_inicio.toISOString().slice(0,10)} -> ${c.venta.fecha_venta.toISOString().slice(0,10)}`)
  }

  const aplicar = process.argv.includes('--aplicar')
  if (!aplicar) {
    console.log('\n(Simulación — vuelve a correr con --aplicar para guardar los cambios)')
    return
  }

  let actualizadas = 0
  for (const c of afectadas) {
    await prisma.cuenta.update({
      where: { id_cuenta: c.id_cuenta },
      data: { fecha_inicio: c.venta.fecha_venta },
    })
    actualizadas++
  }
  console.log(`\nCorregidas ${actualizadas} cuentas.`)
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
