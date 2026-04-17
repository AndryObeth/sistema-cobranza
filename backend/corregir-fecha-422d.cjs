require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '422-D' }
  })
  if (!cuenta) { console.log('❌ No se encontró la cuenta 422-D'); return }

  // Buscar pago con fecha 13-04-2026
  const inicio = new Date('2026-04-13T00:00:00')
  const fin    = new Date('2026-04-13T23:59:59')

  const pago = await prisma.pago.findFirst({
    where: {
      id_cuenta:  cuenta.id_cuenta,
      fecha_pago: { gte: inicio, lte: fin }
    }
  })

  if (!pago) { console.log('❌ No se encontró un pago con fecha 13-04-2026 en la cuenta 422-D'); return }

  console.log('Pago encontrado:')
  console.log('  id_pago:', pago.id_pago)
  console.log('  fecha actual:', pago.fecha_pago.toLocaleDateString('es-MX'))
  console.log('  monto:', parseFloat(pago.monto_pago))

  await prisma.pago.update({
    where: { id_pago: pago.id_pago },
    data:  { fecha_pago: new Date('2026-03-13T12:00:00') }
  })

  console.log('✅ Fecha corregida a 13-03-2026')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
