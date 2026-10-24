require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '35-F' },
    include: {
      cliente: { select: { nombre: true } },
      venta: { select: { fecha_venta: true, plan_venta: true, created_at: true } },
    },
  })
  if (!cuenta) {
    console.log('No se encontró cuenta 35-F')
    return
  }
  console.log(JSON.stringify(cuenta, null, 2))
  const semanas = (Date.now() - new Date(cuenta.fecha_inicio).getTime()) / (7*24*60*60*1000)
  console.log('Semanas transcurridas (fecha_inicio -> hoy):', semanas.toFixed(2))
  const semanasDesdeVenta = (Date.now() - new Date(cuenta.venta.fecha_venta).getTime()) / (7*24*60*60*1000)
  console.log('Semanas transcurridas (fecha_venta -> hoy):', semanasDesdeVenta.toFixed(2))
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
