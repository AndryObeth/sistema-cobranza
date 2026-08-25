// Corrige los pagos duplicados por reintento de sincronizacion con señal mala
// (Grupo 1 del analisis: cobrador Martin Aldair Setina Olivarez, 14 cuentas).
// Para cada cuenta: deja el primer pago de cada cadena y elimina los repetidos
// (junto con su comision), luego recalcula saldo_actual, fecha_ultimo_pago,
// semanas_atraso y estado_cuenta — y revierte a "activa" las que quedaron
// marcadas como liquidadas por el duplicado.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { calcularSemanasAtraso, calcularEstadoPorAtraso } = require('./src/utils/atraso')

const ID_PAGOS_A_ELIMINAR = [
  1714, 1727,       // 12-C (deja 1708)
  1721,             // 20-C (deja 1716)
  1750,             // 22-C (deja 1749)
  1715, 1728,       // 26-C (deja 1711)
  1658,             // 41-C (deja 1657)
  1692,             // 46-C (deja 1691)
  1660,             // 61-C (deja 1659)
  1712, 1726,       // 78-C (deja 1706)
  1709, 1724,       // 158-C (deja 1703)
  1718, 1729,       // 204-C (deja 1713)
  1730,             // 281-C (deja 1717)
  1745,             // 313-C (deja 1741)
  1760,             // 325-C (deja 1757)
  1710, 1725,       // 432-C (deja 1704)
]

async function main() {
  const pagos = await prisma.pago.findMany({
    where: { id_pago: { in: ID_PAGOS_A_ELIMINAR } },
    include: { cuenta: true, comision_cobrador: true }
  })

  if (pagos.length !== ID_PAGOS_A_ELIMINAR.length) {
    throw new Error(`Se esperaban ${ID_PAGOS_A_ELIMINAR.length} pagos, se encontraron ${pagos.length}. Abortando.`)
  }
  if (pagos.some(p => p.tipo_pago !== 'abono')) {
    throw new Error('Hay un pago que no es tipo "abono". Abortando.')
  }

  const porCuenta = {}
  for (const p of pagos) {
    if (!porCuenta[p.id_cuenta]) porCuenta[p.id_cuenta] = { cuenta: p.cuenta, pagos: [] }
    porCuenta[p.id_cuenta].pagos.push(p)
  }

  for (const id_cuenta of Object.keys(porCuenta)) {
    const { cuenta, pagos: pagosAEliminar } = porCuenta[id_cuenta]
    const sumaEliminada = pagosAEliminar.reduce((s, p) => s + parseFloat(p.monto_pago), 0)
    const nuevoSaldo = parseFloat((parseFloat(cuenta.saldo_actual) + sumaEliminada).toFixed(2))

    await prisma.$transaction(async (tx) => {
      // Comisiones del cobrador ligadas a estos pagos
      await tx.comisionCobrador.deleteMany({
        where: { id_pago: { in: pagosAEliminar.map(p => p.id_pago) } }
      })
      // Los pagos duplicados
      await tx.pago.deleteMany({
        where: { id_pago: { in: pagosAEliminar.map(p => p.id_pago) } }
      })

      // Fecha del pago valido mas reciente que queda en la cuenta
      const ultimoPagoValido = await tx.pago.findFirst({
        where: { id_cuenta: parseInt(id_cuenta) },
        orderBy: { fecha_pago: 'desc' }
      })
      const nuevaFechaUltimoPago = ultimoPagoValido?.fecha_pago || cuenta.fecha_primer_cobro

      const nuevasSemanasAtraso = nuevoSaldo === 0 ? 0 : calcularSemanasAtraso({
        fecha_primer_cobro: cuenta.fecha_primer_cobro,
        fecha_ultimo_pago: nuevaFechaUltimoPago,
        frecuencia_pago: cuenta.frecuencia_pago,
      })
      const nuevoEstado = nuevoSaldo === 0 ? 'liquidada' : calcularEstadoPorAtraso(nuevasSemanasAtraso)

      await tx.cuenta.update({
        where: { id_cuenta: parseInt(id_cuenta) },
        data: {
          saldo_actual: nuevoSaldo,
          fecha_ultimo_pago: nuevaFechaUltimoPago,
          semanas_atraso: nuevasSemanasAtraso,
          estado_cuenta: nuevoEstado,
        }
      })

      // Si el duplicado la habia marcado liquidada en falso, revertir tambien la venta
      if (cuenta.estado_cuenta === 'liquidada' && nuevoEstado !== 'liquidada') {
        await tx.venta.update({
          where: { id_venta: cuenta.id_venta },
          data: { estatus_venta: 'activa' }
        })
      }
    })

    console.log(`Cuenta ${cuenta.numero_cuenta || cuenta.folio_cuenta}: -${pagosAEliminar.length} pago(s) duplicado(s), +$${sumaEliminada} -> saldo_actual ${cuenta.saldo_actual} => ${nuevoSaldo}${cuenta.estado_cuenta === 'liquidada' ? ` | estado revertido de "liquidada"` : ''}`)
  }

  console.log(`\nListo. ${pagos.length} pagos duplicados eliminados en ${Object.keys(porCuenta).length} cuentas.`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
