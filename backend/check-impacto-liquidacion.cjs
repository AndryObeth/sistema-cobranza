require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuentas = await prisma.cuenta.findMany({
    where: {
      plan_inicial: 'largo_plazo',
      nivel_reestructura: 0,
      estado_cuenta: { in: ['activa', 'atraso', 'moroso'] },
    },
    include: { venta: { select: { fecha_venta: true } } },
  })

  const SEMANAS = ms => ms / (7*24*60*60*1000)
  let cambiaDeElegibleANo = 0
  let cambiaDeNoElegibleASi = 0
  let sinCambio = 0

  for (const c of cuentas) {
    const semanasActual = SEMANAS(Date.now() - new Date(c.fecha_inicio).getTime())
    const semanasReal   = SEMANAS(Date.now() - new Date(c.venta.fecha_venta).getTime())
    const elegibleActual = semanasActual <= 12
    const elegibleReal   = semanasReal <= 12
    if (elegibleActual && !elegibleReal) cambiaDeElegibleANo++
    else if (!elegibleActual && elegibleReal) cambiaDeNoElegibleASi++
    else sinCambio++
  }

  console.log(`Cuentas vivas, largo_plazo, sin reestructura: ${cuentas.length}`)
  console.log(`Se muestran elegibles hoy pero NO deberían (fecha real > 12 sem): ${cambiaDeElegibleANo}`)
  console.log(`Se muestran NO elegibles pero SÍ deberían serlo: ${cambiaDeNoElegibleASi}`)
  console.log(`Sin cambio de resultado: ${sinCambio}`)
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect())
