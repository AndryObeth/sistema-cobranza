require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '207-D' },
    include: { pagos: { orderBy: { fecha_pago: 'desc' } } }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 207-D'); return }
  if (cuenta.pagos.length === 0) { console.log('❌ La cuenta 207-D no tiene pagos'); return }

  const pago = cuenta.pagos[0]
  const nuevoMonto = 500
  const saldo_anterior = parseFloat(pago.saldo_anterior)
  const saldo_nuevo = parseFloat((saldo_anterior - nuevoMonto).toFixed(2))
  const comision = parseFloat((nuevoMonto * 0.12).toFixed(2))

  console.log(`Pago encontrado:`)
  console.log(`  id_pago       : ${pago.id_pago}`)
  console.log(`  monto actual  : $${pago.monto_pago}  →  $${nuevoMonto}`)
  console.log(`  fecha actual  : ${pago.fecha_pago.toISOString().split('T')[0]}  →  2026-02-13`)
  console.log(`  saldo_anterior: $${saldo_anterior}`)
  console.log(`  saldo_nuevo   : $${saldo_nuevo}`)

  const nuevo_estado = saldo_nuevo === 0 ? 'liquidada'
    : cuenta.semanas_atraso > 4 ? 'moroso'
    : cuenta.semanas_atraso > 1 ? 'atraso'
    : 'activa'

  await prisma.$transaction(async (tx) => {
    // Corregir el pago
    await tx.pago.update({
      where: { id_pago: pago.id_pago },
      data: {
        monto_pago:             nuevoMonto,
        saldo_nuevo,
        monto_aplicado_saldo:   pago.aplica_a_enganche_regado ? 0 : nuevoMonto,
        fecha_pago:             new Date('2026-02-13T12:00:00'),
      }
    })

    // Actualizar saldo de la cuenta
    await tx.cuenta.update({
      where: { id_cuenta: cuenta.id_cuenta },
      data: {
        saldo_actual:  saldo_nuevo,
        estado_cuenta: nuevo_estado,
      }
    })

    // Corregir comisión del cobrador
    await tx.comisionCobrador.updateMany({
      where: { id_pago: pago.id_pago },
      data: {
        monto_cobrado:     nuevoMonto,
        comision_generada: comision,
      }
    })
  })

  console.log(`\n✅ Corrección aplicada:`)
  console.log(`   Monto: $${nuevoMonto} | Fecha: 2026-02-13 | Saldo cuenta: $${saldo_nuevo} | Estado: ${nuevo_estado}`)
}

main().catch(e => { console.error('❌', e.message) }).finally(() => prisma.$disconnect())
