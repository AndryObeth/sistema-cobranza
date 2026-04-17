/**
 * limpiar-datos-prueba.cjs
 * Elimina todos los datos de prueba conservando usuarios y productos.
 * Ejecutar UNA SOLA VEZ: node limpiar-datos-prueba.cjs
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function limpiar() {
  console.log('🗑  Iniciando limpieza de datos de prueba...\n')

  // Orden: primero las tablas hijas, luego las padres
  const pasos = [
    { modelo: 'detalleCorteCorador',   label: 'Detalles de corte cobrador' },
    { modelo: 'detalleCorteVendedor',  label: 'Detalles de corte vendedor' },
    { modelo: 'corteCobrador',         label: 'Cortes cobrador'            },
    { modelo: 'corteVendedor',         label: 'Cortes vendedor'            },
    { modelo: 'recuperacionEnganche',  label: 'Recuperaciones de enganche' },
    { modelo: 'comisionCobrador',      label: 'Comisiones cobrador'        },
    { modelo: 'comisionVendedor',      label: 'Comisiones vendedor'        },
    { modelo: 'utilidadContado',       label: 'Utilidades contado'         },
    { modelo: 'seguimientoCliente',    label: 'Seguimientos'               },
    { modelo: 'pago',                  label: 'Pagos'                      },
    { modelo: 'cuenta',                label: 'Cuentas'                    },
    { modelo: 'detalleVenta',          label: 'Detalles de venta'          },
    { modelo: 'venta',                 label: 'Ventas'                     },
    { modelo: 'cliente',               label: 'Clientes'                   },
  ]

  for (const { modelo, label } of pasos) {
    const result = await prisma[modelo].deleteMany({})
    console.log(`  ✓ ${label.padEnd(30)} — ${result.count} registros eliminados`)
  }

  console.log('\n✅ Limpieza completada. Usuarios y productos conservados.')
}

limpiar()
  .catch(e => {
    console.error('\n❌ Error durante la limpieza:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
