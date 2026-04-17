require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CORRECCIONES = [
  { fecha: '2026-01-16', monto: 250 },
  { fecha: '2026-01-22', monto: 200 },
  { fecha: '2026-02-06', monto: 240 },
]

function mismaFecha(d1, fechaStr) {
  const d = new Date(d1)
  return d.toISOString().split('T')[0] === fechaStr
}

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '346-D' },
    include: { pagos: { orderBy: { fecha_pago: 'asc' } } }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 346-D'); return }

  console.log(`Cuenta 346-D | Saldo actual: $${cuenta.saldo_actual}`)
  console.log(`Total pagos: ${cuenta.pagos.length}\n`)

  // Aplicar correcciones de monto
  for (const corr of CORRECCIONES) {
    const pago = cuenta.pagos.find(p => mismaFecha(p.fecha_pago, corr.fecha))
    if (!pago) {
      console.log(`⚠️  No se encontró pago en fecha ${corr.fecha}`)
    } else {
      console.log(`  ${corr.fecha}: $${pago.monto_pago} → $${corr.monto}  (id: ${pago.id_pago})`)
      pago.monto_pago = corr.monto
    }
  }

  // Recalcular cadena de saldos
  let saldo_corriente = parseFloat(cuenta.saldo_inicial)
  const actualizaciones = []

  for (const pago of cuenta.pagos) {
    const saldo_anterior = parseFloat(saldo_corriente.toFixed(2))
    const monto = parseFloat(pago.monto_pago)
    const saldo_nuevo = parseFloat((saldo_anterior - monto).toFixed(2))
    const comision = parseFloat((monto * 0.12).toFixed(2))

    actualizaciones.push({ pago, saldo_anterior, saldo_nuevo, monto, comision })
    saldo_corriente = saldo_nuevo
  }

  const saldo_final = actualizaciones.at(-1)?.saldo_nuevo ?? parseFloat(cuenta.saldo_inicial)
  const nuevo_estado = saldo_final === 0 ? 'liquidada'
    : cuenta.semanas_atraso > 4 ? 'moroso'
    : cuenta.semanas_atraso > 1 ? 'atraso'
    : 'activa'

  console.log(`\nSaldo resultante: $${saldo_final} | Estado: ${nuevo_estado}\n`)

  await prisma.$transaction(async (tx) => {
    for (const { pago, saldo_anterior, saldo_nuevo, monto, comision } of actualizaciones) {
      await tx.pago.update({
        where: { id_pago: pago.id_pago },
        data: { monto_pago: monto, saldo_anterior, saldo_nuevo,
                monto_aplicado_saldo: pago.aplica_a_enganche_regado ? 0 : monto }
      })
      await tx.comisionCobrador.updateMany({
        where: { id_pago: pago.id_pago },
        data: { monto_cobrado: monto, comision_generada: comision }
      })
    }

    await tx.cuenta.update({
      where: { id_cuenta: cuenta.id_cuenta },
      data: { saldo_actual: saldo_final, estado_cuenta: nuevo_estado }
    })
  })

  console.log('✅ Correcciones aplicadas y saldos recalculados.')
}

main().catch(e => { console.error('❌', e.message) }).finally(() => prisma.$disconnect())
