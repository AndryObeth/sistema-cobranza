const express = require('express')
const router  = express.Router()
const auth    = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

// GET /api/dashboard/resumen
router.get('/resumen', auth, async (req, res) => {
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const manana = new Date(hoy)
    manana.setDate(manana.getDate() + 1)

    const [
      total_clientes_activos,
      ventas_hoy,
      cobros_hoy,
      clientes_morosos,
      cuentas_activas,
      cuentas_en_atraso,
      planes_vencidos,
      clientes_sin_ubicacion
    ] = await Promise.all([
      prisma.cliente.count({ where: { activo: true } }),

      prisma.venta.findMany({
        where: { fecha_venta: { gte: hoy, lt: manana } },
        select: { precio_final_total: true }
      }),

      prisma.pago.findMany({
        where: { fecha_pago: { gte: hoy, lt: manana } },
        select: { monto_pago: true }
      }),

      prisma.cuenta.count({ where: { estado_cuenta: 'moroso' } }),

      prisma.cuenta.count({ where: { estado_cuenta: { in: ['activa', 'atraso'] } } }),

      prisma.cuenta.count({ where: { estado_cuenta: 'atraso' } }),

      prisma.cuenta.count({
        where: {
          estado_cuenta: { in: ['activa', 'atraso', 'moroso'] },
          plan_actual:   { not: 'largo_plazo' },
          fecha_limite:  { lt: new Date() },
        }
      }),

      prisma.cliente.count({ where: { activo: true, latitud: null } })
    ])

    const total_ventas_hoy  = ventas_hoy.length
    const monto_ventas_hoy  = ventas_hoy.reduce((s, v) => s + parseFloat(v.precio_final_total), 0)
    const pagos_hoy         = cobros_hoy.length
    const total_cobrado_hoy = cobros_hoy.reduce((s, p) => s + parseFloat(p.monto_pago), 0)

    res.json({
      total_clientes_activos,
      total_ventas_hoy,
      monto_ventas_hoy:   parseFloat(monto_ventas_hoy.toFixed(2)),
      total_cobrado_hoy:  parseFloat(total_cobrado_hoy.toFixed(2)),
      pagos_hoy,
      clientes_morosos,
      cuentas_activas,
      cuentas_en_atraso,
      planes_vencidos,
      clientes_sin_ubicacion,
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener resumen', detalle: error.message })
  }
})

module.exports = router
