require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '367-D' },
    include: {
      venta: true,
      pagos: { orderBy: { fecha_pago: 'asc' } }
    }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 367-D'); return }

  console.log('=== CUENTA ===')
  console.log(`  numero_cuenta  : ${cuenta.numero_cuenta}`)
  console.log(`  plan_actual    : ${cuenta.plan_actual}`)
  console.log(`  precio_original: $${cuenta.precio_original_total}`)
  console.log(`  precio_plan    : $${cuenta.precio_plan_actual}`)
  console.log(`  abono_inicial  : $${cuenta.abono_inicial}`)
  console.log(`  saldo_inicial  : $${cuenta.saldo_inicial}`)
  console.log(`  saldo_actual   : $${cuenta.saldo_actual}`)
  console.log(`  estado         : ${cuenta.estado_cuenta}`)

  console.log('\n=== VENTA ===')
  console.log(`  precio_final_total      : $${cuenta.venta.precio_final_total}`)
  console.log(`  enganche_recibido_total : $${cuenta.venta.enganche_recibido_total}`)

  console.log(`\n=== PAGOS (${cuenta.pagos.length}) ===`)
  for (const p of cuenta.pagos) {
    console.log(`  ${p.fecha_pago.toISOString().split('T')[0]} | $${p.monto_pago} | saldo_ant: $${p.saldo_anterior} → saldo_nuevo: $${p.saldo_nuevo}`)
  }
}

main().catch(e => { console.error('❌', e.message) }).finally(() => prisma.$disconnect())
