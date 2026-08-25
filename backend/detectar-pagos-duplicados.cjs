// Script de solo lectura: agrupa pagos consecutivos con mismo monto/tipo/cobrador
// en la misma cuenta y muy cerca en el tiempo (cadenas), como candidatos a
// duplicados por reintento de sincronizacion. No borra nada, solo reporta.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const VENTANA_MIN = 15 // minutos máx. entre pagos consecutivos para considerarlos parte de la misma cadena

async function main() {
  const pagos = await prisma.pago.findMany({
    orderBy: [{ id_cuenta: 'asc' }, { fecha_pago: 'asc' }],
    include: {
      cuenta: { select: { numero_cuenta: true, folio_cuenta: true } },
      cliente: { select: { nombre: true } },
      cobrador: { select: { nombre: true } }
    }
  })

  const porCuenta = {}
  for (const p of pagos) {
    if (!porCuenta[p.id_cuenta]) porCuenta[p.id_cuenta] = []
    porCuenta[p.id_cuenta].push(p)
  }

  const cadenas = []

  for (const id_cuenta of Object.keys(porCuenta)) {
    const lista = porCuenta[id_cuenta]
    let cadenaActual = [lista[0]]
    for (let i = 1; i < lista.length; i++) {
      const prev = lista[i - 1]
      const cur = lista[i]
      const minutos = (new Date(cur.fecha_pago) - new Date(prev.fecha_pago)) / 60000
      const mismo = parseFloat(prev.monto_pago) === parseFloat(cur.monto_pago) &&
                    prev.tipo_pago === cur.tipo_pago &&
                    prev.id_cobrador === cur.id_cobrador &&
                    minutos <= VENTANA_MIN
      if (mismo) {
        cadenaActual.push(cur)
      } else {
        if (cadenaActual.length > 1) cadenas.push(cadenaActual)
        cadenaActual = [cur]
      }
    }
    if (cadenaActual.length > 1) cadenas.push(cadenaActual)
  }

  let totalExtra = 0
  let montoExtra = 0

  console.log(`\nCadenas de pagos identicos consecutivos (candidatos a duplicado):\n`)
  for (const cadena of cadenas) {
    const a = cadena[0]
    const extra = cadena.length - 1
    totalExtra += extra
    montoExtra += extra * parseFloat(a.monto_pago)
    const ids = cadena.map(p => p.id_pago).join(', ')
    console.log(`Cuenta ${a.cuenta?.numero_cuenta || a.cuenta?.folio_cuenta} (${a.cliente.nombre}) — cobrador: ${a.cobrador.nombre}`)
    console.log(`  ${cadena.length} pagos de $${a.monto_pago} (${a.tipo_pago}) — ids: ${ids} — sugerido: dejar 1, quitar ${extra}`)
  }

  console.log(`\nTotal cadenas: ${cadenas.length} | Pagos "extra" sugeridos a quitar: ${totalExtra} | Monto total de esos extra: $${montoExtra.toFixed(2)}`)

  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
