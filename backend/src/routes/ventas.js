const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/ventas
router.get('/', auth, async (req, res) => {
  try {
    const ventas = await prisma.venta.findMany({
      include: {
        cliente: true,
        vendedor: true,
        detalles: true
      },
      orderBy: { fecha_venta: 'desc' }
    })
    res.json(ventas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ventas', detalle: error.message })
  }
})

// GET /api/ventas/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const venta = await prisma.venta.findUnique({
      where: { id_venta: parseInt(req.params.id) },
      include: {
        cliente: true,
        vendedor: true,
        detalles: true,
        cuenta: true
      }
    })
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    res.json(venta)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener venta' })
  }
})

// POST /api/ventas — registrar venta
router.post('/', auth, async (req, res) => {
  try {
    const {
      id_cliente, id_cobrador, ruta,
      tipo_venta, plan_venta,
      precio_original_total, precio_final_total,
      enganche_recibido_total, observaciones,
      detalles
    } = req.body

    const enganche_objetivo = precio_original_total * 0.10
    const enganche_para_vendedor = Math.min(enganche_recibido_total, enganche_objetivo)
    const enganche_regado = Math.max(0, enganche_objetivo - enganche_recibido_total)
    const sobreenganche = Math.max(0, enganche_recibido_total - enganche_objetivo)
    const monto_reportado = tipo_venta === 'contado'
      ? precio_original_total * 0.50
      : sobreenganche
    const utilidad_vendedor_contado = tipo_venta === 'contado'
      ? precio_final_total - monto_reportado
      : 0

    const folio_venta = 'VTA-' + Date.now()

    const venta = await prisma.venta.create({
      data: {
        folio_venta,
        id_cliente,
        id_vendedor: req.usuario.id,
        id_cobrador,
        ruta,
        tipo_venta,
        plan_venta,
        precio_original_total,
        precio_final_total,
        enganche_recibido_total: enganche_recibido_total || 0,
        enganche_objetivo_vendedor: enganche_objetivo,
        enganche_para_vendedor,
        enganche_regado,
        sobreenganche,
        monto_reportado_negocio: monto_reportado,
        utilidad_vendedor_contado,
        observaciones,
        estatus_venta: tipo_venta === 'contado' ? 'liquidada' : 'activa',
        detalles: {
          create: detalles
        }
      },
      include: { detalles: true }
    })

    // Si es a plazos, crear la cuenta automáticamente
    if (tipo_venta === 'plazo') {
      const semanas = plan_venta === 'un_mes' ? 4
        : plan_venta === 'dos_meses' ? 8
        : plan_venta === 'tres_meses' ? 12
        : 52

      await prisma.cuenta.create({
        data: {
          folio_cuenta: 'CTA-' + Date.now(),
          id_venta: venta.id_venta,
          id_cliente,
          plan_inicial: plan_venta,
          plan_actual: plan_venta,
          precio_original_total,
          precio_plan_actual: precio_final_total,
          abono_inicial: enganche_recibido_total || 0,
          saldo_inicial: precio_final_total - (enganche_recibido_total || 0),
          saldo_actual: precio_final_total - (enganche_recibido_total || 0),
          semanas_plazo: semanas,
          fecha_limite: new Date(Date.now() + semanas * 7 * 24 * 60 * 60 * 1000)
        }
      })
    }

    res.status(201).json({ mensaje: 'Venta registrada', venta })
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar venta', detalle: error.message })
  }
})

module.exports = router