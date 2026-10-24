require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const pagos = await prisma.pago.findMany({
    where: { tipo_pago: 'descuento', observaciones: { startsWith: 'Descuento por liquidación anticipada' } },
    include: { cuenta: { include: { venta: { select: { fecha_venta: true } } } }, cliente: { select: { nombre: true } } },
    orderBy: { fecha_pago: 'desc' },
  })
  console.log(`Liquidaciones anticipadas ya aplicadas: ${pagos.length}\n`)
  for (const p of pagos) {
    const semanasReales = (new Date(p.fecha_pago) - new Date(p.cuenta.venta.fecha_venta)) / (7*24*60*60*1000)
    console.log(`Pago #${p.id_pago} cuenta ${p.cuenta.numero_cuenta} (${p.cliente.nombre}) — fecha_pago=${p.fecha_pago.toISOString().slice(0,10)} monto=$${p.monto_pago}`)
    console.log(`  ${p.observaciones}`)
    console.log(`  Semanas reales desde la venta al momento de liquidar: ${semanasReales.toFixed(1)}`)
    console.log('')
  }
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
