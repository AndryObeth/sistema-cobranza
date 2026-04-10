const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Helper: inicio y fin de la semana actual (lunes–domingo)
function semanaActual() {
  const hoy = new Date()
  const dia = hoy.getDay() // 0=domingo
  const diffLunes = dia === 0 ? -6 : 1 - dia
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() + diffLunes)
  lunes.setHours(0, 0, 0, 0)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  domingo.setHours(23, 59, 59, 999)
  return { inicio: lunes, fin: domingo }
}

// ─────────────────────────────────────────
// CORTES COBRADOR
// ─────────────────────────────────────────

// 1. GET /api/cortes/cobrador/resumen/:id_cobrador
router.get('/cobrador/resumen/:id_cobrador', auth, async (req, res) => {
  try {
    const id_cobrador = parseInt(req.params.id_cobrador)
    const { inicio, fin } = semanaActual()

    const pagos = await prisma.pago.findMany({
      where: {
        id_cobrador,
        fecha_pago: { gte: inicio, lte: fin }
      },
      include: {
        cliente: { select: { nombre: true } },
        comision_cobrador: true
      },
      orderBy: { fecha_pago: 'asc' }
    })

    const total_cobrado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_pago), 0)
    const total_comisiones = pagos.reduce(
      (sum, p) => sum + parseFloat(p.comision_cobrador?.comision_generada || 0), 0
    )

    const detalle = pagos.map(p => ({
      id_pago: p.id_pago,
      cliente: p.cliente.nombre,
      monto: parseFloat(p.monto_pago),
      comision_generada: parseFloat(p.comision_cobrador?.comision_generada || 0),
      fecha_pago: p.fecha_pago,
      origen_pago: p.origen_pago
    }))

    res.json({
      semana_inicio: inicio,
      semana_fin: fin,
      total_cobrado,
      total_comisiones,
      cantidad_pagos: pagos.length,
      detalle
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener resumen', detalle: error.message })
  }
})

// 2. POST /api/cortes/cobrador/cerrar
router.post('/cobrador/cerrar', auth, async (req, res) => {
  try {
    const { id_cobrador, fecha_inicio, fecha_fin, total_depositado, observaciones } = req.body

    const pagos = await prisma.pago.findMany({
      where: {
        id_cobrador,
        fecha_pago: {
          gte: new Date(fecha_inicio),
          lte: new Date(fecha_fin)
        }
      },
      include: { comision_cobrador: true }
    })

    const total_cobrado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_pago), 0)
    const comision_total = pagos.reduce(
      (sum, p) => sum + parseFloat(p.comision_cobrador?.comision_generada || 0), 0
    )
    const diferencia = total_cobrado - parseFloat(total_depositado)

    const corte = await prisma.corteCobrador.create({
      data: {
        id_cobrador,
        fecha_inicio: new Date(fecha_inicio),
        fecha_fin: new Date(fecha_fin),
        total_cobrado,
        total_depositado: parseFloat(total_depositado),
        diferencia,
        comision_total,
        estado_corte: 'cerrado',
        observaciones,
        detalles: {
          create: pagos.map(p => ({
            id_pago: p.id_pago,
            monto_pago: parseFloat(p.monto_pago),
            comision_generada: parseFloat(p.comision_cobrador?.comision_generada || 0)
          }))
        }
      },
      include: { detalles: true }
    })

    res.status(201).json({ mensaje: 'Corte cerrado exitosamente', corte })
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar corte', detalle: error.message })
  }
})

// 3. GET /api/cortes/cobrador/historial/:id_cobrador
router.get('/cobrador/historial/:id_cobrador', auth, async (req, res) => {
  try {
    const id_cobrador = parseInt(req.params.id_cobrador)

    const cortes = await prisma.corteCobrador.findMany({
      where: { id_cobrador },
      include: {
        cobrador: { select: { nombre: true } }
      },
      orderBy: { created_at: 'desc' }
    })

    res.json(cortes)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial', detalle: error.message })
  }
})

// ─────────────────────────────────────────
// CORTES VENDEDOR
// ─────────────────────────────────────────

// 4. GET /api/cortes/vendedor/pendientes
router.get('/vendedor/pendientes', auth, async (req, res) => {
  try {
    const recuperaciones = await prisma.recuperacionEnganche.findMany({
      where: { estado_corte: 'pendiente_corte' },
      include: {
        venta: {
          include: {
            vendedor:        { select: { id_usuario: true, nombre: true } },
            jefe_camioneta:  { select: { nombre: true } },
            cliente:         { select: { nombre: true } }
          }
        }
      },
      orderBy: { fecha_recuperacion: 'asc' }
    })

    // Agrupar por vendedor
    const porVendedor = {}
    for (const rec of recuperaciones) {
      const id_v = rec.id_vendedor
      if (!porVendedor[id_v]) {
        porVendedor[id_v] = {
          id_vendedor: id_v,
          nombre_vendedor: rec.venta.vendedor.nombre,
          total_a_pagar: 0,
          cantidad_recuperaciones: 0,
          recuperaciones: []
        }
      }
      porVendedor[id_v].total_a_pagar += parseFloat(rec.monto_neto_vendedor)
      porVendedor[id_v].cantidad_recuperaciones++
      porVendedor[id_v].recuperaciones.push({
        id_recuperacion: rec.id_recuperacion,
        cliente: rec.venta.cliente.nombre,
        jefe_camioneta: rec.venta.jefe_camioneta?.nombre || null,
        monto_recuperado: parseFloat(rec.monto_recuperado),
        comision_cobrador: parseFloat(rec.comision_cobrador),
        monto_neto_vendedor: parseFloat(rec.monto_neto_vendedor),
        fecha_recuperacion: rec.fecha_recuperacion
      })
    }

    res.json(Object.values(porVendedor))
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pendientes', detalle: error.message })
  }
})

// 5. POST /api/cortes/vendedor/pagar
router.post('/vendedor/pagar', auth, async (req, res) => {
  try {
    const { id_vendedor, tipo_corte, ids_recuperaciones } = req.body

    const ids = ids_recuperaciones.map(Number)

    const recuperaciones = await prisma.recuperacionEnganche.findMany({
      where: { id_recuperacion: { in: ids } }
    })

    const total_pagado = recuperaciones.reduce(
      (sum, r) => sum + parseFloat(r.monto_neto_vendedor), 0
    )

    const corte = await prisma.corteVendedor.create({
      data: {
        id_vendedor,
        tipo_corte,
        total_pagado,
        estado_corte: 'pagado',
        detalles: {
          create: recuperaciones.map(r => ({
            id_recuperacion: r.id_recuperacion,
            monto_pagado: parseFloat(r.monto_neto_vendedor)
          }))
        }
      },
      include: { detalles: true }
    })

    await prisma.recuperacionEnganche.updateMany({
      where: { id_recuperacion: { in: ids } },
      data: { estado_corte: 'pagado' }
    })

    res.status(201).json({ mensaje: 'Corte de vendedor registrado', corte })
  } catch (error) {
    res.status(500).json({ error: 'Error al pagar corte vendedor', detalle: error.message })
  }
})

// 6. GET /api/cortes/vendedor/historial/:id_vendedor
router.get('/vendedor/historial/:id_vendedor', auth, async (req, res) => {
  try {
    const id_vendedor = parseInt(req.params.id_vendedor)

    const cortes = await prisma.corteVendedor.findMany({
      where: { id_vendedor },
      include: {
        vendedor: { select: { nombre: true } },
        detalles: {
          include: {
            recuperacion: {
              include: {
                venta: {
                  include: { cliente: { select: { nombre: true } } }
                }
              }
            }
          }
        }
      },
      orderBy: { fecha_corte: 'desc' }
    })

    res.json(cortes)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial vendedor', detalle: error.message })
  }
})

module.exports = router
