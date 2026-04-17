require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const PRECIO_CORRECTO = 1995
const ENGANCHE        = 100
const SALDO_CORRECTO  = PRECIO_CORRECTO - ENGANCHE  // 1895

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '567-D' },
    include: {
      venta: { include: { detalles: true } },
      pagos: { orderBy: { fecha_pago: 'asc' } }
    }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 567-D'); return }

  const v = cuenta.venta

  console.log('Estado actual:')
  console.log('  precio_final_total:  $', parseFloat(v.precio_final_total))
  console.log('  precio_original_total: $', parseFloat(v.precio_original_total))
  console.log('  saldo_inicial:       $', parseFloat(cuenta.saldo_inicial))
  console.log('  saldo_actual:        $', parseFloat(cuenta.saldo_actual))
  console.log('  pagos registrados:    ', cuenta.pagos.length)

  if (cuenta.pagos.length > 0) {
    console.log('⚠️  Ya hay pagos registrados — solo se corrige precio y saldo_inicial, NO saldo_actual')
  }

  // Corregir venta
  await prisma.venta.update({
    where: { id_venta: v.id_venta },
    data: {
      precio_final_total:    PRECIO_CORRECTO,
      precio_original_total: PRECIO_CORRECTO,
    }
  })
  console.log('✅ Venta corregida: precio_final_total = $', PRECIO_CORRECTO)

  // Corregir detalle (precio_unitario y subtotal que quedaron NaN/null)
  for (const d of v.detalles) {
    await prisma.detalleVenta.update({
      where: { id_detalle_venta: d.id_detalle_venta },
      data: {
        precio_original_unitario: PRECIO_CORRECTO,
        precio_final_unitario:    PRECIO_CORRECTO,
        subtotal_original:        PRECIO_CORRECTO * d.cantidad,
        subtotal_final:           PRECIO_CORRECTO * d.cantidad,
      }
    })
    console.log('✅ Detalle corregido: precio_final_unitario = $', PRECIO_CORRECTO)
  }

  // Corregir cuenta
  const nuevaSaldoActual = cuenta.pagos.length === 0
    ? SALDO_CORRECTO
    : parseFloat(cuenta.saldo_actual)  // si ya hay pagos, no tocar saldo_actual

  await prisma.cuenta.update({
    where: { id_cuenta: cuenta.id_cuenta },
    data: {
      saldo_inicial: SALDO_CORRECTO,
      saldo_actual:  nuevaSaldoActual,
      abono_inicial: ENGANCHE,
    }
  })
  console.log('✅ Cuenta corregida:')
  console.log('   saldo_inicial = $', SALDO_CORRECTO)
  console.log('   saldo_actual  = $', nuevaSaldoActual)
  console.log('   abono_inicial = $', ENGANCHE)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
