require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Buscar cuenta principal 397-D
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '397-D' },
    include: {
      pagos: { orderBy: { fecha_pago: 'asc' } }
    }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 397-D'); return }

  console.log('✅ Cuenta encontrada:', cuenta.folio_cuenta)
  console.log('   Saldo actual:', parseFloat(cuenta.saldo_actual))
  console.log('   Observaciones:', cuenta.observaciones)

  // Parsear el monto fusionado de las observaciones
  const match = cuenta.observaciones?.match(/saldo sumado: \$([0-9.]+)/)
  if (!match) {
    console.log('❌ No se encontró el monto de fusión en observaciones')
    return
  }
  const saldoSumado = parseFloat(match[1])
  console.log('   Monto fusionado:', saldoSumado)

  // Parsear las cuentas anexadas
  const matchCuentas = cuenta.observaciones?.match(/se anexaron cuentas \[([^\]]+)\]/)
  const cuentasStr = matchCuentas ? matchCuentas[1] : 'cuentas secundarias'

  // Parsear la fecha de fusión
  const matchFecha = cuenta.observaciones?.match(/Fusión el (\d{1,2}\/\d{1,2}\/\d{4})/)
  const fechaFusion = matchFecha
    ? (() => { const [d,m,y] = matchFecha[1].split('/'); return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T12:00:00`) })()
    : new Date()

  // Buscar admin para usar como id_cobrador
  const admin = await prisma.usuario.findFirst({ where: { rol: 'administrador' } })
  if (!admin) { console.log('❌ No se encontró un administrador'); return }

  // Verificar que no exista ya un pago de fusión
  const pagoExistente = await prisma.pago.findFirst({
    where: {
      id_cuenta: cuenta.id_cuenta,
      observaciones: { startsWith: 'Fusión:' }
    }
  })
  if (pagoExistente) {
    console.log('⚠️  Ya existe un pago de fusión para esta cuenta, no se duplica.')
    return
  }

  // Calcular saldo_anterior aproximado (saldo actual - montos pagados después de la fusión)
  // Usamos saldo_actual actual para saldo_nuevo, y saldo_nuevo - saldoSumado para saldo_anterior
  const saldoNuevoFusion = parseFloat(cuenta.saldo_actual)
  const saldoAnteriorFusion = parseFloat((saldoNuevoFusion - saldoSumado).toFixed(2))

  const pago = await prisma.pago.create({
    data: {
      id_cuenta:            cuenta.id_cuenta,
      id_cliente:           cuenta.id_cliente,
      id_cobrador:          admin.id_usuario,
      fecha_pago:           fechaFusion,
      monto_pago:           saldoSumado,
      saldo_anterior:       Math.max(0, saldoAnteriorFusion),
      saldo_nuevo:          saldoNuevoFusion,
      tipo_pago:            'pago_extra',
      monto_aplicado_saldo: saldoSumado,
      observaciones:        `Fusión: cuentas anexadas [${cuentasStr}]`,
      origen_pago:          'oficina',
    }
  })

  console.log(`✅ Pago de fusión registrado (id: ${pago.id_pago})`)
  console.log(`   Fecha: ${fechaFusion.toLocaleDateString('es-MX')}`)
  console.log(`   Monto sumado: $${saldoSumado}`)
  console.log(`   Cuentas: ${cuentasStr}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
