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

// GET /api/pagos/todas-cuentas — todas las cuentas activas (para admin/cobrador)
router.get('/todas-cuentas', auth, async (req, res) => {
  try {
    const where = { estado_cuenta: { in: ['activa', 'atraso', 'moroso'] } }
    if (req.usuario.rol === 'cobrador' && req.usuario.ruta_asignada) {
      where.cliente = { ruta: req.usuario.ruta_asignada }
    }
    const cuentas = await prisma.cuenta.findMany({
      where,
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

// PUT /api/pagos/cuenta/:id/frecuencia — actualizar frecuencia y horario
router.put('/cuenta/:id/frecuencia', auth, async (req, res) => {
  try {
    const id_cuenta = parseInt(req.params.id)
    const { fecha_primer_cobro, horario_preferido, frecuencia_pago } = req.body

    const data = {}
    if (frecuencia_pago    !== undefined) data.frecuencia_pago    = frecuencia_pago
    if (horario_preferido  !== undefined) data.horario_preferido  = horario_preferido
    if (fecha_primer_cobro !== undefined) data.fecha_primer_cobro = fecha_primer_cobro ? new Date(fecha_primer_cobro) : null

    const cuenta = await prisma.cuenta.update({
      where: { id_cuenta },
      data
    })
    res.json({ mensaje: 'Frecuencia actualizada', cuenta })
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar frecuencia', detalle: error.message })
  }
})

// POST /api/pagos — registrar pago
router.post('/', auth, async (req, res) => {
  try {
    const { id_cuenta, monto_pago, tipo_pago, origen_pago, observaciones, fecha_pago } = req.body
    const esAdmin = req.usuario.rol === 'administrador'
    const fechaPago = esAdmin && fecha_pago ? new Date(fecha_pago) : new Date()

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

    // Si es recuperación de enganche, cargar la venta para obtener id_vendedor y enganche_regado
    const esRecuperacion = tipo_pago === 'recuperacion_enganche'
    let venta = null
    if (esRecuperacion) {
      venta = await prisma.venta.findUnique({
        where: { id_venta: cuenta.id_venta },
        select: {
          id_venta: true,
          id_vendedor: true,
          id_jefe_camioneta: true,
          enganche_regado: true,
          vendedor: { select: { rol: true } }
        }
      })
    }

    const aplica_a_enganche_regado  = esRecuperacion
    const monto_aplicado_enganche   = esRecuperacion ? monto : 0
    const monto_aplicado_saldo      = esRecuperacion ? 0 : monto

    // Crear pago
    const pago = await prisma.pago.create({
      data: {
        id_cuenta: parseInt(id_cuenta),
        id_cliente: cuenta.id_cliente,
        id_cobrador: req.usuario.id,
        fecha_pago: fechaPago,
        monto_pago: monto,
        saldo_anterior,
        saldo_nuevo,
        tipo_pago: tipo_pago || 'abono',
        origen_pago: origen_pago || 'domicilio',
        aplica_a_enganche_regado,
        monto_aplicado_enganche_regado: monto_aplicado_enganche,
        monto_aplicado_saldo,
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

    // Si se liquidó, sincronizar estatus de la venta
    if (saldo_nuevo === 0) {
      await prisma.venta.update({
        where: { id_venta: cuenta.id_venta },
        data: { estatus_venta: 'liquidada' }
      })
    }

    // Registrar comisión del cobrador
    await prisma.comisionCobrador.create({
      data: {
        id_pago: pago.id_pago,
        id_cobrador: req.usuario.id,
        monto_cobrado: monto,
        comision_generada: comision
      }
    })

    // Si es recuperación de enganche: crear RecuperacionEnganche
    // Funciona igual para vendedor y jefe_camioneta (ambos son id_vendedor de la venta)
    if (esRecuperacion && venta) {
      const comision_cob   = parseFloat((monto * 0.12).toFixed(2))
      const neto_vendedor  = parseFloat((monto - comision_cob).toFixed(2))
      // Regla: si hay un vendedor real asignado (rol='vendedor'), él recibe el enganche.
      // Si no hay vendedor real (solo jefe de grupo), el jefe recibe el enganche.
      const tieneVendedorReal = venta.vendedor?.rol === 'vendedor'
      const id_beneficiario = tieneVendedorReal
        ? venta.id_vendedor
        : (venta.id_jefe_camioneta || venta.id_vendedor)
      await prisma.recuperacionEnganche.create({
        data: {
          id_venta:            venta.id_venta,
          id_pago:             pago.id_pago,
          id_vendedor:         id_beneficiario,
          id_cobrador:         req.usuario.id,
          monto_recuperado:    monto,
          comision_cobrador:   comision_cob,
          monto_neto_vendedor: neto_vendedor,
          estado_corte:        'pendiente_corte'
        }
      })
    }

    res.status(201).json({
      mensaje: 'Pago registrado',
      pago,
      saldo_nuevo,
      estado_nuevo: nuevo_estado,
      comision_cobrador: comision,
      ...(esRecuperacion && { recuperacion_enganche: true })
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar pago', detalle: error.message })
  }
})

module.exports = router
