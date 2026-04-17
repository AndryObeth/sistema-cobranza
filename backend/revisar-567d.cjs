require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '567-D' },
    include: {
      venta: { include: { detalles: { include: { producto_rel: true } } } },
      pagos: { orderBy: { fecha_pago: 'asc' } }
    }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 567-D'); return }

  const v = cuenta.venta
  console.log('══════════════════════════════════════')
  console.log('CUENTA 567-D')
  console.log('══════════════════════════════════════')
  console.log('Folio:              ', cuenta.folio_cuenta)
  console.log('Estado:             ', cuenta.estado_cuenta)
  console.log('Plan:               ', cuenta.plan_actual)
  console.log('')
  console.log('── VENTA ──────────────────────────────')
  console.log('Precio original:    $', parseFloat(v.precio_original_total))
  console.log('Precio final (plan):$', parseFloat(v.precio_final_total))
  console.log('Enganche recibido:  $', parseFloat(v.enganche_recibido_total))
  console.log('')
  console.log('── PRODUCTOS ──────────────────────────')
  for (const d of v.detalles) {
    const nombre = d.producto_rel?.nombre_comercial || d.nombre_producto_custom || '(especial)'
    console.log(` · ${nombre} x${d.cantidad}  precio_unitario: $${parseFloat(d.precio_unitario)}  subtotal: $${parseFloat(d.subtotal)}`)
  }
  console.log('')
  console.log('── CUENTA ─────────────────────────────')
  console.log('Saldo inicial:      $', parseFloat(cuenta.saldo_inicial))
  console.log('Abono inicial:      $', parseFloat(cuenta.abono_inicial))
  console.log('Saldo actual:       $', parseFloat(cuenta.saldo_actual))
  console.log('')
  console.log('Esperado saldo_inicial = precio_final - enganche:',
    parseFloat(v.precio_final_total) - parseFloat(v.enganche_recibido_total))
  console.log('')
  console.log('── PAGOS ──────────────────────────────')
  if (cuenta.pagos.length === 0) {
    console.log('  (sin pagos registrados)')
  } else {
    for (const p of cuenta.pagos) {
      console.log(` [${new Date(p.fecha_pago).toLocaleDateString('es-MX')}] $${parseFloat(p.monto_pago)}  saldo_ant: $${parseFloat(p.saldo_anterior)} → saldo_nvo: $${parseFloat(p.saldo_nuevo)}  tipo: ${p.tipo_pago}`)
    }
  }
  console.log('')
  console.log('Saldo tras pagos esperado:',
    cuenta.pagos.reduce((s, p) => s - parseFloat(p.monto_pago), parseFloat(cuenta.saldo_inicial)).toFixed(2))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
