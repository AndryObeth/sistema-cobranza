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
        vendedor: { select: { nombre: true } },
        jefe_camioneta: { select: { nombre: true } },
        detalles: true,
        cuenta: { select: { numero_cuenta: true, folio_cuenta: true, id_cuenta: true, frecuencia_pago: true } }
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
      id_cliente, id_cobrador, id_jefe_camioneta, ruta,
      tipo_venta, plan_venta,
      precio_original_total, precio_final_total,
      precio_final_total_override, observacion_ajuste,
      enganche_recibido_total, observaciones,
      fecha_venta,
      frecuencia_pago, fecha_primer_cobro, horario_preferido,
      numero_cuenta,
      saldo_inicial_override,
      detalles,
      id_vendedor: id_vendedor_body
    } = req.body

    const esAdmin = req.usuario.rol === 'administrador'
    const esSecretaria = req.usuario.rol === 'secretaria'
    // Admin/secretaria pueden asignar otro vendedor; el resto usa su propio id
    const id_vendedor_final = (esAdmin || esSecretaria) && id_vendedor_body
      ? parseInt(id_vendedor_body)
      : req.usuario.id
    const precio_final_usado = esAdmin && precio_final_total_override != null
      ? parseFloat(precio_final_total_override)
      : parseFloat(precio_final_total)

    const enganche_objetivo = precio_original_total * 0.10
    const enganche_para_vendedor = Math.min(enganche_recibido_total || 0, enganche_objetivo)
    const enganche_regado = Math.max(0, enganche_objetivo - (enganche_recibido_total || 0))
    const sobreenganche = Math.max(0, (enganche_recibido_total || 0) - enganche_objetivo)
    const monto_reportado = tipo_venta === 'contado'
      ? precio_original_total * 0.50
      : sobreenganche
    const utilidad_vendedor_contado = tipo_venta === 'contado'
      ? precio_final_usado - monto_reportado
      : 0

    // Combinar observaciones con motivo de ajuste si aplica
    const observaciones_final = observacion_ajuste
      ? `${observaciones || ''}${observaciones ? ' | ' : ''}[Ajuste de precio: ${observacion_ajuste}]`
      : observaciones

    const folio_venta = 'VTA-' + Date.now()

    const venta = await prisma.venta.create({
      data: {
        folio_venta,
        id_cliente,
        id_vendedor: id_vendedor_final,
        id_cobrador,
        id_jefe_camioneta: id_jefe_camioneta ? parseInt(id_jefe_camioneta) : null,
        ruta,
        tipo_venta,
        plan_venta,
        fecha_venta: fecha_venta ? new Date(fecha_venta + 'T12:00:00') : new Date(),
        precio_original_total,
        precio_final_total: precio_final_usado,
        enganche_recibido_total: enganche_recibido_total || 0,
        enganche_objetivo_vendedor: enganche_objetivo,
        enganche_para_vendedor,
        enganche_regado,
        sobreenganche,
        monto_reportado_negocio: monto_reportado,
        utilidad_vendedor_contado,
        observaciones: observaciones_final,
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
          numero_cuenta: numero_cuenta || null,
          id_venta: venta.id_venta,
          id_cliente,
          plan_inicial: plan_venta,
          plan_actual: plan_venta,
          precio_original_total,
          precio_plan_actual: precio_final_usado,
          abono_inicial: enganche_recibido_total || 0,
          saldo_inicial: esAdmin && saldo_inicial_override != null ? parseFloat(saldo_inicial_override) : precio_final_usado - (enganche_recibido_total || 0),
          saldo_actual:  esAdmin && saldo_inicial_override != null ? parseFloat(saldo_inicial_override) : precio_final_usado - (enganche_recibido_total || 0),
          semanas_plazo: semanas,
          fecha_limite: new Date(Date.now() + semanas * 7 * 24 * 60 * 60 * 1000),
          frecuencia_pago:    frecuencia_pago    || 'semanal',
          fecha_primer_cobro: fecha_primer_cobro ? new Date(fecha_primer_cobro + 'T12:00:00') : null,
          horario_preferido:  horario_preferido  || null
        }
      })
    }

    res.status(201).json({ mensaje: 'Venta registrada', venta })
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar venta', detalle: error.message })
  }
})

// PUT /api/ventas/:id — editar venta (solo administrador)
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.usuario.rol !== 'administrador') {
      return res.status(403).json({ error: 'Solo el administrador puede editar ventas' })
    }

    const id_venta = parseInt(req.params.id)
    const { fecha_venta, precio_final_total, enganche_recibido_total, observaciones, estatus_venta } = req.body

    const ventaActual = await prisma.venta.findUnique({
      where: { id_venta },
      include: { cuenta: { include: { pagos: { orderBy: { fecha_pago: 'asc' } } } } }
    })
    if (!ventaActual) return res.status(404).json({ error: 'Venta no encontrada' })

    const dataUpdate = {}
    if (fecha_venta !== undefined)           dataUpdate.fecha_venta            = new Date(fecha_venta + 'T12:00:00')
    if (precio_final_total !== undefined)    dataUpdate.precio_final_total      = parseFloat(precio_final_total)
    if (enganche_recibido_total !== undefined) dataUpdate.enganche_recibido_total = parseFloat(enganche_recibido_total)
    if (observaciones !== undefined)         dataUpdate.observaciones           = observaciones
    if (estatus_venta !== undefined)         dataUpdate.estatus_venta           = estatus_venta

    const venta = await prisma.venta.update({
      where: { id_venta },
      data: dataUpdate
    })

    // Si cambió el precio o el enganche y hay cuenta asociada, ajustar saldos
    if ((precio_final_total !== undefined || enganche_recibido_total !== undefined) && ventaActual.cuenta) {
      const precioNuevo    = precio_final_total       !== undefined ? parseFloat(precio_final_total)       : parseFloat(ventaActual.precio_final_total)
      const engancheNuevo  = enganche_recibido_total  !== undefined ? parseFloat(enganche_recibido_total)  : parseFloat(ventaActual.enganche_recibido_total || 0)
      const precioViejo    = parseFloat(ventaActual.precio_final_total)
      const engancheViejo  = parseFloat(ventaActual.enganche_recibido_total || 0)

      // saldo_inicial se recalcula desde cero; saldo_actual preserva los pagos ya hechos
      const nuevo_saldo_inicial = Math.max(0, precioNuevo - engancheNuevo)
      const delta = (precioNuevo - precioViejo) - (engancheNuevo - engancheViejo)
      const nuevo_saldo_actual  = Math.max(0, parseFloat(ventaActual.cuenta.saldo_actual) + delta)

      await prisma.cuenta.update({
        where: { id_cuenta: ventaActual.cuenta.id_cuenta },
        data: {
          precio_plan_actual: precioNuevo,
          abono_inicial:      engancheNuevo,
          saldo_inicial:      nuevo_saldo_inicial,
          saldo_actual:       nuevo_saldo_actual,
          estado_cuenta:      nuevo_saldo_actual === 0 ? 'liquidada' : ventaActual.cuenta.estado_cuenta
        }
      })

      // Propagar el delta a todos los pagos para que el historial sea consistente
      if (delta !== 0 && ventaActual.cuenta.pagos.length > 0) {
        for (const pago of ventaActual.cuenta.pagos) {
          await prisma.pago.update({
            where: { id_pago: pago.id_pago },
            data: {
              saldo_anterior: Math.max(0, parseFloat(pago.saldo_anterior) + delta),
              saldo_nuevo:    Math.max(0, parseFloat(pago.saldo_nuevo) + delta),
            }
          })
        }
      }
    }

    res.json({ mensaje: 'Venta actualizada', venta })
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar venta', detalle: error.message })
  }
})

module.exports = router