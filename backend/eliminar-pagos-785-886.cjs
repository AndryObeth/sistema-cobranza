// Corrección: eliminar 2 pagos equivocados de cuenta 31-C
// Pago 785 — 2026-07-26  $500  saldo_anterior=2500 → saldo_nuevo=2000
// Pago 886 — 2026-08-09  $500  saldo_anterior=2000 → saldo_nuevo=1500
// Resultado: saldo_actual vuelve a $2500, fecha_ultimo_pago = 2026-07-12 (pago 784, el último que sí queda)

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const ID_CUENTA = 192
  const IDS_PAGO  = [785, 886]
  const SALDO_RESTAURADO = 2500
  const FECHA_ULTIMO_PAGO_RESTAURADA = new Date('2026-07-12T12:00:00.000Z') // pago 784

  const cuenta = await prisma.cuenta.findUnique({ where: { id_cuenta: ID_CUENTA } })
  if (!cuenta) { console.error('Cuenta no encontrada'); process.exit(1) }

  const pagos = await prisma.pago.findMany({
    where: { id_pago: { in: IDS_PAGO } },
    orderBy: { id_pago: 'asc' }
  })
  if (pagos.length !== 2) { console.error('No se encontraron los 2 pagos esperados'); process.exit(1) }

  console.log('\n── Estado actual ───────────────────────────────────────')
  console.log(`Cuenta  31-C  saldo_actual=$${cuenta.saldo_actual}  fecha_ultimo_pago=${cuenta.fecha_ultimo_pago?.toISOString() ?? 'null'}`)
  pagos.forEach(p => {
    console.log(`Pago id=${p.id_pago}  fecha=${p.fecha_pago.toISOString().slice(0,10)}  monto=$${p.monto_pago}  saldo_anterior=$${p.saldo_anterior}  saldo_nuevo=$${p.saldo_nuevo}`)
  })

  console.log('\n── Cambios a aplicar ────────────────────────────────────')
  console.log(`Eliminar pagos: ${IDS_PAGO.join(', ')}`)
  console.log(`cuenta.saldo_actual       → $${SALDO_RESTAURADO}`)
  console.log(`cuenta.fecha_ultimo_pago  → ${FECHA_ULTIMO_PAGO_RESTAURADA.toISOString()}`)

  // Verificaciones
  if (pagos[0].id_cuenta !== ID_CUENTA || pagos[1].id_cuenta !== ID_CUENTA) {
    console.error('ABORT: algún pago no pertenece a la cuenta 31-C')
    process.exit(1)
  }
  if (parseFloat(pagos[0].saldo_anterior) !== SALDO_RESTAURADO) {
    console.error(`ABORT: saldo_anterior del pago 785 es ${pagos[0].saldo_anterior}, esperado ${SALDO_RESTAURADO}`)
    process.exit(1)
  }
  if (parseFloat(cuenta.saldo_actual) !== parseFloat(pagos[1].saldo_nuevo)) {
    console.error(`ABORT: saldo_actual de la cuenta (${cuenta.saldo_actual}) no coincide con el saldo_nuevo del último pago (${pagos[1].saldo_nuevo})`)
    process.exit(1)
  }

  const comisiones = await prisma.comisionCobrador.findMany({ where: { id_pago: { in: IDS_PAGO } } })
  const yaEnCorte = comisiones.filter(c => c.semana_corte)
  if (yaEnCorte.length > 0) {
    console.error('ABORT: alguna comisión ya está incluida en un corte semanal, revisar manualmente')
    process.exit(1)
  }

  await prisma.$transaction([
    prisma.comisionCobrador.deleteMany({ where: { id_pago: { in: IDS_PAGO } } }),
    prisma.pago.delete({ where: { id_pago: 785 } }),
    prisma.pago.delete({ where: { id_pago: 886 } }),
    prisma.cuenta.update({
      where: { id_cuenta: ID_CUENTA },
      data: {
        saldo_actual:      SALDO_RESTAURADO,
        fecha_ultimo_pago: FECHA_ULTIMO_PAGO_RESTAURADA,
      }
    })
  ])

  console.log('\n✅ Pagos eliminados y saldo restaurado correctamente')
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
