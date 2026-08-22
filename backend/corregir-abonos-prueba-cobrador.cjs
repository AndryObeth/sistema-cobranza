// Corrección: el cobrador registró varios abonos de $100 de prueba en la misma
// sesión (2026-08-22, entre 19:48 y 22:13) en 5 cuentas reales mientras
// aprendía la app. Se confirma con el admin que solo debe quedar 1 abono de
// esa sesión por cuenta; el resto se elimina y se recalcula el saldo.
//
// Cuenta 273 (98-C):  conservar 1627, eliminar 1628, 1629
// Cuenta 578 (347-C): conservar 1634, eliminar 1635, 1636, 1637, 1641
// Cuenta 480 (316-C): conservar 1642, eliminar 1643, 1644
// Cuenta 209 (49-C):  conservar 1645, eliminar 1646
// Cuenta 213 (53-C):  conservar 1651, eliminar 1652

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CORRECCIONES = [
  { id_cuenta: 273, numero_cuenta: '98-C',  conservar: 1627, eliminar: [1628, 1629] },
  { id_cuenta: 578, numero_cuenta: '347-C', conservar: 1634, eliminar: [1635, 1636, 1637, 1641] },
  { id_cuenta: 480, numero_cuenta: '316-C', conservar: 1642, eliminar: [1643, 1644] },
  { id_cuenta: 209, numero_cuenta: '49-C',  conservar: 1645, eliminar: [1646] },
  { id_cuenta: 213, numero_cuenta: '53-C',  conservar: 1651, eliminar: [1652] },
]

async function main() {
  console.log('── Estado actual y validaciones ─────────────────────────────')
  for (const c of CORRECCIONES) {
    const cuenta = await prisma.cuenta.findUnique({ where: { id_cuenta: c.id_cuenta } })
    if (!cuenta) throw new Error(`ABORT: cuenta ${c.id_cuenta} no encontrada`)
    if (cuenta.numero_cuenta !== c.numero_cuenta) {
      throw new Error(`ABORT: cuenta ${c.id_cuenta} tiene numero_cuenta=${cuenta.numero_cuenta}, esperado ${c.numero_cuenta}`)
    }
    const conservar = await prisma.pago.findUnique({ where: { id_pago: c.conservar } })
    if (!conservar || conservar.id_cuenta !== c.id_cuenta) {
      throw new Error(`ABORT: pago a conservar ${c.conservar} no pertenece a la cuenta ${c.id_cuenta}`)
    }
    const aEliminar = await prisma.pago.findMany({ where: { id_pago: { in: c.eliminar } } })
    if (aEliminar.length !== c.eliminar.length) {
      throw new Error(`ABORT: no se encontraron todos los pagos a eliminar de la cuenta ${c.id_cuenta}`)
    }
    if (aEliminar.some(p => p.id_cuenta !== c.id_cuenta)) {
      throw new Error(`ABORT: algún pago a eliminar no pertenece a la cuenta ${c.id_cuenta}`)
    }
    const sumaEliminada = aEliminar.reduce((s, p) => s + parseFloat(p.monto_pago), 0)
    const saldoRestaurado = parseFloat(cuenta.saldo_actual) + sumaEliminada
    if (saldoRestaurado !== parseFloat(conservar.saldo_nuevo)) {
      throw new Error(`ABORT: cuenta ${c.id_cuenta} — saldo restaurado (${saldoRestaurado}) no coincide con saldo_nuevo del pago conservado (${conservar.saldo_nuevo})`)
    }
    c._cuenta = cuenta
    c._saldoRestaurado = saldoRestaurado
    c._fechaUltimoPago = conservar.fecha_pago
    console.log(`${c.numero_cuenta} (cuenta ${c.id_cuenta}): saldo_actual=$${cuenta.saldo_actual} → $${saldoRestaurado} | eliminar pagos ${c.eliminar.join(', ')} (-$${sumaEliminada})`)
  }

  console.log('\n── Aplicando ─────────────────────────────────────────────')
  const idsEliminarTotal = CORRECCIONES.flatMap(c => c.eliminar)

  await prisma.$transaction([
    prisma.comisionCobrador.deleteMany({ where: { id_pago: { in: idsEliminarTotal } } }),
    prisma.pago.deleteMany({ where: { id_pago: { in: idsEliminarTotal } } }),
    ...CORRECCIONES.map(c => prisma.cuenta.update({
      where: { id_cuenta: c.id_cuenta },
      data: { saldo_actual: c._saldoRestaurado, fecha_ultimo_pago: c._fechaUltimoPago }
    }))
  ])

  console.log('\n✅ Corregidas las 5 cuentas correctamente')
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
