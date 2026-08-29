const express = require('express')
const router  = express.Router()
const auth    = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

// GET /api/dashboard/resumen
router.get('/resumen', auth, async (req, res) => {
  try {
    // "Hoy" en hora de México (UTC-6), no en la hora del servidor (UTC) —
    // si no, después de las 6pm hora México el servidor ya "cree" que es el
    // día siguiente y las tarjetas de "hoy" se muestran vacías de golpe.
    const ahora = new Date()
    const fechaMexicoISO = new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const hoy = new Date(fechaMexicoISO + 'T00:00:00.000-06:00')
    const fin = new Date(fechaMexicoISO + 'T23:59:59.999-06:00')

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
        where: { fecha_venta: { gte: hoy, lte: fin } },
        select: { precio_final_total: true }
      }),

      prisma.pago.findMany({
        // Ajustes administrativos (fusión/anexo de cuentas, enganche inicial
        // al vender) no son cobranza real — no deben inflar "Cobrado hoy".
        where: { fecha_pago: { gte: hoy, lte: fin }, tipo_pago: { notIn: ['pago_extra', 'enganche_inicial', 'descuento'] } },
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
