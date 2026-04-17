require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const cuenta = await prisma.cuenta.findFirst({
    where: { numero_cuenta: '367-D' }
  })

  if (!cuenta) { console.log('❌ No se encontró la cuenta 367-D'); return }

  const enganche = 100
  const saldo_correcto = parseFloat(cuenta.precio_plan_actual) - enganche  // 1610 - 100 = 1510

  console.log(`Corrigiendo cuenta 367-D:`)
  console.log(`  abono_inicial : $${cuenta.abono_inicial}  →  $${enganche}`)
  console.log(`  saldo_inicial : $${cuenta.saldo_inicial}  →  $${saldo_correcto}`)
  console.log(`  saldo_actual  : $${cuenta.saldo_actual}   →  $${saldo_correcto}`)

  await prisma.cuenta.update({
    where: { id_cuenta: cuenta.id_cuenta },
    data: {
      abono_inicial:  enganche,
      saldo_inicial:  saldo_correcto,
      saldo_actual:   saldo_correcto,
    }
  })

  console.log('✅ Listo. La cuenta 367-D ahora refleja el enganche de $100.')
}

main().catch(e => { console.error('❌', e.message) }).finally(() => prisma.$disconnect())
