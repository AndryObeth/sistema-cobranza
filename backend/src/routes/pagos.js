const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/pagos/cartera/:id_cobrador — cartera del cobrador
router.get('/cartera/:id_cobrador', auth, async (req, res) => {
  try {
    const cuentas = await prisma.cuenta.findMany({
      where: {
        estado_cuenta: { in: ['activa', 'atraso', 'moroso'] },
        venta: { id_cobrador: parseInt(req.params.id_cobrador) }
      },
      include: {
        cliente: true,
        venta: { include: { detalles: true } }
      },
      orderBy: { semanas_atraso: 'desc' }
    })
    res.json(cuentas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cartera', detalle: error.message })
  }
})

// GET /api/pagos/cuenta/:id_cuenta — detalle de una cuenta
router.get('/cuenta/:id_cuenta', auth, async (req, res) => {
  try {
    const cuenta = await prisma.cuenta.findUnique({
      where: { id_cuenta: parseInt(req.params.id_cuenta) },
      include: {
        cliente: true,
        venta: { include: { detalles: true } },
        pagos: {
          orderBy: { fecha_pago: 'desc' },
          take: 10,
          include: { cobrador: true }
        }
      }
    })
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' })
    res.json(cuenta)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cuenta' })
  }
})

// GET /api/pagos/todas-cuentas — todas las cuentas activas (para admin)
router.get('/todas-cuentas', auth, async (req, res) => {
  try {
    const cuentas = await prisma.cuenta.findMany({
      where: {
        estado_cuenta: { in: ['activa', 'atraso', 'moroso'] }
      },
      include: {
        cliente: true,
        venta: { include: { vendedor: true, cobrador: true } }
      },
      orderBy: { semanas_atraso: 'desc' }
    })
    res.json(cuentas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cuentas' })
  }
})

// POST /api/pagos — registrar pago
router.post('/', auth, async (req, res) => {
  try {
    const { id_cuenta, monto_pago, tipo_pago, origen_pago, observaciones } = req.body

    const monto = parseFloat(monto_pago)

    // Validación: monto debe ser mayor a cero
    if (!monto_pago || isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a cero' })
    }

    const cuenta = await prisma.cuenta.findUnique({
      where: { id_cuenta: parseInt(id_cuenta) }
    })

    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta no encontrada' })
    }

    // Validación: no permitir pagos en cuentas liquidadas o canceladas
    if (cuenta.estado_cuenta === 'liquidada') {
      return res.status(400).json({ error: 'Esta cuenta ya está liquidada' })
    }
    if (cuenta.estado_cuenta === 'cancelada') {
      return res.status(400).json({ error: 'No se puede registrar un pago en una cuenta cancelada' })
    }

    const saldo_anterior = parseFloat(cuenta.saldo_actual)

    // Validación: monto no puede superar el saldo actual
    if (monto > saldo_anterior) {
      return res.status(400).json({
        error: `El monto ($${monto.toFixed(2)}) no puede ser mayor al saldo actual ($${saldo_anterior.toFixed(2)})`
      })
    }

    const saldo_nuevo = parseFloat((saldo_anterior - monto).toFixed(2))
    const comision = parseFloat((monto * 0.12).toFixed(2))

    // Calcular nuevo estado
    const nuevo_estado = saldo_nuevo === 0 ? 'liquidada'
      : cuenta.semanas_atraso > 4 ? 'moroso'
      : cuenta.semanas_atraso > 1 ? 'atraso'
      : 'activa'

    // Crear pago
    const pago = await prisma.pago.create({
      data: {
        id_cuenta: parseInt(id_cuenta),
        id_cliente: cuenta.id_cliente,
        id_cobrador: req.usuario.id,
        monto_pago: monto,
        saldo_anterior,
        saldo_nuevo,
        tipo_pago: tipo_pago || 'abono',
        origen_pago: origen_pago || 'domicilio',
        monto_aplicado_saldo: monto,
        observaciones
      }
    })

    // Actualizar cuenta
    await prisma.cuenta.update({
      where: { id_cuenta: parseInt(id_cuenta) },
      data: {
        saldo_actual: saldo_nuevo,
        fecha_ultimo_pago: new Date(),
        estado_cuenta: nuevo_estado,
        semanas_atraso: saldo_nuevo === 0 ? 0 : cuenta.semanas_atraso
      }
    })

    // Registrar comisión del cobrador
    await prisma.comisionCobrador.create({
      data: {
        id_pago: pago.id_pago,
        id_cobrador: req.usuario.id,
        monto_cobrado: monto,
        comision_generada: comision
      }
    })

    res.status(201).json({
      mensaje: 'Pago registrado',
      pago,
      saldo_nuevo,
      estado_nuevo: nuevo_estado,
      comision_cobrador: comision
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar pago', detalle: error.message })
  }
})

module.exports = router
