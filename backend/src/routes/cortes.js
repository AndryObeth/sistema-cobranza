const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Helpers de fecha en zona horaria de México (UTC-6 fijo, sin horario de verano)
function fechaMexicoISO(date = new Date()) {
  return new Date(date.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function sumarDiasISO(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}
function diaSemanaISO(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=domingo
}
function inicioDiaMexico(fechaISO) {
  return new Date(fechaISO + 'T00:00:00.000-06:00')
}
function finDiaMexico(fechaISO) {
  return new Date(fechaISO + 'T23:59:59.999-06:00')
}

// Ajustes administrativos que mueven saldo (fusión/anexo de cuentas, enganche
// inicial registrado al vender) no son cobranza real de un cobrador en ruta —
// no deben contar en sus totales de "cobrado" ni pagarle comisión.
const TIPOS_PAGO_NO_COBRANZA = ['pago_extra', 'enganche_inicial', 'descuento']

// Helper: inicio y fin de la semana actual en México (lunes–domingo)
function semanaActual() {
  const hoyISO = fechaMexicoISO()
  const dia = diaSemanaISO(hoyISO)
  const diffLunes = dia === 0 ? -6 : 1 - dia
  const lunesISO = sumarDiasISO(hoyISO, diffLunes)
  const domingoISO = sumarDiasISO(lunesISO, 6)
  return { inicio: inicioDiaMexico(lunesISO), fin: finDiaMexico(domingoISO) }
}

// ─────────────────────────────────────────
// CORTES COBRADOR
// ─────────────────────────────────────────

// 1. GET /api/cortes/cobrador/resumen/:id_cobrador
router.get('/cobrador/resumen/:id_cobrador', auth, async (req, res) => {
  try {
    // Un cobrador solo puede ver su propio resumen
    const id_cobrador = req.usuario.rol === 'cobrador'
      ? req.usuario.id
      : parseInt(req.params.id_cobrador)
    const { fecha_inicio, fecha_fin } = req.query

    const { inicio, fin } = (fecha_inicio && fecha_fin)
      ? { inicio: inicioDiaMexico(fecha_inicio), fin: finDiaMexico(fecha_fin) }
      : semanaActual()

    const pagos = await prisma.pago.findMany({
      where: {
        id_cobrador,
        fecha_pago: { gte: inicio, lte: fin },
        detalles_corte: { none: {} }, // ya incluido en un corte cerrado: no se vuelve a mostrar
        tipo_pago: { notIn: TIPOS_PAGO_NO_COBRANZA }
      },
      include: {
        cliente: { select: { nombre: true } },
        cuenta:  { select: { numero_cuenta: true, folio_cuenta: true } },
        comision_cobrador: true,
        comprobante: { select: { id_comprobante: true } }
      },
      orderBy: { fecha_pago: 'asc' }
    })

    const total_cobrado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_pago), 0)
    // Depositos directos: el cliente deposito a la empresa, el cobrador NO trae
    // ese dinero fisico. Cuentan para comision pero no para el efectivo a entregar.
    const total_deposito = pagos
      .filter(p => p.metodo_pago === 'deposito')
      .reduce((sum, p) => sum + parseFloat(p.monto_pago), 0)
    const total_efectivo = parseFloat((total_cobrado - total_deposito).toFixed(2))
    const total_comisiones = pagos.reduce(
      (sum, p) => sum + parseFloat(p.comision_cobrador?.comision_generada || 0), 0
    )

    const detalle = pagos.map(p => ({
      id_pago: p.id_pago,
      cliente: p.cliente.nombre,
      numero_cuenta: p.cuenta?.numero_cuenta || p.cuenta?.folio_cuenta || null,
      monto: parseFloat(p.monto_pago),
      comision_generada: parseFloat(p.comision_cobrador?.comision_generada || 0),
      saldo_nuevo: parseFloat(p.saldo_nuevo),
      fecha_pago: p.fecha_pago,
      origen_pago: p.origen_pago,
      metodo_pago: p.metodo_pago,
      tiene_comprobante: !!p.comprobante
    }))

    res.json({
      semana_inicio: inicio,
      semana_fin: fin,
      total_cobrado,
      total_deposito,
      total_efectivo,
      total_comisiones,
      cantidad_pagos: pagos.length,
      detalle
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener resumen', detalle: error.message })
  }
})

// 2. POST /api/cortes/cobrador/cerrar
// - Un cobrador solo puede cerrar SU propio corte, y queda "en_revision"
//   (el admin lo aprueba después).
// - Admin/supervisor cierra el de cualquiera y queda "cerrado" directo.
router.post('/cobrador/cerrar', auth, async (req, res) => {
  try {
    const esCobrador = req.usuario.rol === 'cobrador'
    const id_cobrador = esCobrador ? req.usuario.id : req.body.id_cobrador
    const { fecha_inicio, fecha_fin, total_depositado, observaciones } = req.body
    if (!id_cobrador) return res.status(400).json({ error: 'Falta id_cobrador' })

    const pagos = await prisma.pago.findMany({
      where: {
        id_cobrador,
        fecha_pago: {
          gte: new Date(fecha_inicio),
          lte: new Date(fecha_fin)
        },
        detalles_corte: { none: {} }, // no volver a cerrar pagos ya incluidos en otro corte
        tipo_pago: { notIn: TIPOS_PAGO_NO_COBRANZA }
      },
      include: { comision_cobrador: true }
    })

    if (pagos.length === 0) {
      return res.status(400).json({ error: 'No hay pagos nuevos para cerrar en este periodo (ya fueron incluidos en otro corte, o no hay pagos registrados).' })
    }

    const total_cobrado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_pago), 0)
    const total_deposito = pagos
      .filter(p => p.metodo_pago === 'deposito')
      .reduce((sum, p) => sum + parseFloat(p.monto_pago), 0)
    const total_efectivo = parseFloat((total_cobrado - total_deposito).toFixed(2))
    const comision_total = pagos.reduce(
      (sum, p) => sum + parseFloat(p.comision_cobrador?.comision_generada || 0), 0
    )
    // La diferencia cuadra el EFECTIVO: lo que el cobrador cobro en efectivo vs
    // lo que entrego/deposito. Los depositos directos no entran (nunca los tuvo).
    const diferencia = parseFloat((total_efectivo - parseFloat(total_depositado)).toFixed(2))

    const corte = await prisma.corteCobrador.create({
      data: {
        id_cobrador,
        fecha_inicio: new Date(fecha_inicio),
        fecha_fin: new Date(fecha_fin),
        total_cobrado,
        total_deposito,
        total_depositado: parseFloat(total_depositado),
        diferencia,
        comision_total,
        estado_corte: esCobrador ? 'en_revision' : 'cerrado',
        cerrado_por: req.usuario.id,
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

    res.status(201).json({
      mensaje: esCobrador ? 'Corte entregado para revisión' : 'Corte cerrado exitosamente',
      corte,
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar corte', detalle: error.message })
  }
})

// 3. GET /api/cortes/cobrador/historial/:id_cobrador
router.get('/cobrador/historial/:id_cobrador', auth, async (req, res) => {
  try {
    const id_cobrador = req.usuario.rol === 'cobrador'
      ? req.usuario.id
      : parseInt(req.params.id_cobrador)

    const cortes = await prisma.corteCobrador.findMany({
      where: { id_cobrador },
      include: {
        cobrador: { select: { nombre: true } },
        detalles: {
          include: {
            pago: {
              select: {
                fecha_pago: true, origen_pago: true, saldo_nuevo: true, metodo_pago: true,
                cliente: { select: { nombre: true } },
                cuenta: { select: { numero_cuenta: true, folio_cuenta: true } },
                comprobante: { select: { id_comprobante: true } }
              }
            }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    })

    // quién lo cerró/entregó (nombre) para mostrarlo en el historial
    const idsCerrado = [...new Set(cortes.map(c => c.cerrado_por).filter(Boolean))]
    const usuarios = idsCerrado.length
      ? await prisma.usuario.findMany({ where: { id_usuario: { in: idsCerrado } }, select: { id_usuario: true, nombre: true, rol: true } })
      : []
    const mapaU = Object.fromEntries(usuarios.map(u => [u.id_usuario, u]))

    res.json(cortes.map(c => ({
      ...c,
      cerrado_por_nombre: c.cerrado_por ? (mapaU[c.cerrado_por]?.nombre || null) : null,
      cerrado_por_el_cobrador: c.cerrado_por === c.id_cobrador,
    })))
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial', detalle: error.message })
  }
})

// 3b. PUT /api/cortes/cobrador/:id/aprobar — admin/supervisor aprueba un corte
// que el cobrador dejó "en_revision". Puede ajustar total_depositado y notas.
router.put('/cobrador/:id/aprobar', auth, async (req, res) => {
  try {
    if (!['administrador', 'supervisor_cobranza'].includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Solo admin/supervisor puede aprobar cortes' })
    }
    const id = parseInt(req.params.id)
    const corte = await prisma.corteCobrador.findUnique({ where: { id_corte_cobrador: id } })
    if (!corte) return res.status(404).json({ error: 'Corte no encontrado' })
    if (corte.estado_corte !== 'en_revision') {
      return res.status(400).json({ error: `El corte está "${corte.estado_corte}", no "en_revision"` })
    }

    const data = { estado_corte: 'cerrado' }
    if (req.body.total_depositado != null && req.body.total_depositado !== '') {
      const nuevoDepositado = parseFloat(req.body.total_depositado)
      const totalEfectivo = parseFloat((parseFloat(corte.total_cobrado) - parseFloat(corte.total_deposito)).toFixed(2))
      data.total_depositado = nuevoDepositado
      data.diferencia = parseFloat((totalEfectivo - nuevoDepositado).toFixed(2))
    }
    if (typeof req.body.observaciones === 'string') data.observaciones = req.body.observaciones

    const actualizado = await prisma.corteCobrador.update({ where: { id_corte_cobrador: id }, data })
    res.json({ mensaje: 'Corte aprobado', corte: actualizado })
  } catch (error) {
    res.status(500).json({ error: 'Error al aprobar corte', detalle: error.message })
  }
})

// 3c. DELETE /api/cortes/cobrador/:id — admin/supervisor reabre (borra) un corte.
// Los pagos quedan libres para incluirse en otro corte. No se puede si ya está "pagado".
router.delete('/cobrador/:id', auth, async (req, res) => {
  try {
    if (!['administrador', 'supervisor_cobranza'].includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Solo admin/supervisor puede reabrir cortes' })
    }
    const id = parseInt(req.params.id)
    const corte = await prisma.corteCobrador.findUnique({ where: { id_corte_cobrador: id } })
    if (!corte) return res.status(404).json({ error: 'Corte no encontrado' })
    if (corte.estado_corte === 'pagado') {
      return res.status(400).json({ error: 'No se puede reabrir un corte ya pagado' })
    }
    await prisma.$transaction([
      prisma.detalleCorteCorador.deleteMany({ where: { id_corte_cobrador: id } }),
      prisma.corteCobrador.delete({ where: { id_corte_cobrador: id } }),
    ])
    res.json({ mensaje: 'Corte reabierto — los pagos quedaron libres' })
  } catch (error) {
    res.status(500).json({ error: 'Error al reabrir corte', detalle: error.message })
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
