const express = require('express')
const router  = express.Router()
const auth    = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEMANAS_POR_PLAN = {
  un_mes:     4,
  dos_meses:  8,
  tres_meses: 12,
  largo_plazo: 52,
}

const LABEL_PLAN = {
  un_mes:     '1 mes',
  dos_meses:  '2 meses',
  tres_meses: '3 meses',
  largo_plazo: 'Largo plazo',
}

// Verifica si TODOS los productos de la venta soportan el plan solicitado
function planAplicaEnDetalles(detalles, nuevoPlan) {
  if (nuevoPlan === 'largo_plazo') return true
  if (nuevoPlan === 'dos_meses')   return detalles.every(d => d.producto_rel?.aplica_2_meses && d.producto_rel?.precio_2_meses)
  if (nuevoPlan === 'tres_meses')  return detalles.every(d => d.producto_rel?.aplica_3_meses && d.producto_rel?.precio_3_meses)
  return false
}

// Calcula el precio total para el nuevo plan sumando todos los productos
function calcularPrecioNuevoPlan(detalles, nuevoPlan, precio_original_total) {
  if (nuevoPlan === 'largo_plazo') return parseFloat(precio_original_total)
  if (nuevoPlan === 'dos_meses')   return detalles.reduce((s, d) => s + parseFloat(d.producto_rel.precio_2_meses  || 0) * d.cantidad, 0)
  if (nuevoPlan === 'tres_meses')  return detalles.reduce((s, d) => s + parseFloat(d.producto_rel.precio_3_meses  || 0) * d.cantidad, 0)
  return 0
}

// Devuelve el siguiente plan aplicable según la progresión del negocio
function siguientePlanAplicable(planActual, detalles) {
  const progresion = {
    un_mes:      ['dos_meses', 'tres_meses', 'largo_plazo'],
    dos_meses:   ['tres_meses', 'largo_plazo'],
    tres_meses:  ['largo_plazo'],
    largo_plazo: [],
  }
  for (const plan of (progresion[planActual] || [])) {
    if (planAplicaEnDetalles(detalles, plan)) return plan
  }
  return null
}

// Carga una cuenta con todos los datos necesarios para calcular el cambio de plan
async function cargarCuentaCompleta(id_cuenta) {
  return prisma.cuenta.findUnique({
    where: { id_cuenta },
    include: {
      cliente: { select: { nombre: true, numero_cuenta: true } },
      venta: {
        include: {
          detalles: {
            include: {
              producto_rel: {
                select: {
                  aplica_2_meses: true, precio_2_meses: true,
                  aplica_3_meses: true, precio_3_meses: true,
                  abono_semanal_largo: true,
                }
              }
            }
          }
        }
      }
    }
  })
}

// ── 0. GET /api/cuentas/estado-cumplimiento/:id_cuenta ───────────────────────

const DIAS_POR_FRECUENCIA = {
  semanal:    7,
  quincenal:  15,
  mensual:    30,
  dos_meses:  60,
}

router.get('/estado-cumplimiento/:id_cuenta', auth, async (req, res) => {
  try {
    const cuenta = await prisma.cuenta.findUnique({
      where: { id_cuenta: parseInt(req.params.id_cuenta) },
      select: {
        id_cuenta: true,
        frecuencia_pago: true,
        fecha_primer_cobro: true,
        fecha_ultimo_pago: true,
        estado_cuenta: true,
        saldo_actual: true,
      }
    })
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' })

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const dias = DIAS_POR_FRECUENCIA[cuenta.frecuencia_pago] || 7

    // Si no hay fecha de inicio no podemos calcular
    if (!cuenta.fecha_primer_cobro) {
      return res.json({
        id_cuenta: cuenta.id_cuenta,
        esta_al_corriente: null,
        fecha_proximo_pago: null,
        dias_restantes: null,
        periodos_sin_pagar: 0,
      })
    }

    // Próximo pago esperado
    const base = cuenta.fecha_ultimo_pago
      ? new Date(cuenta.fecha_ultimo_pago)
      : new Date(cuenta.fecha_primer_cobro)
    base.setHours(0, 0, 0, 0)

    const fechaProximo = new Date(base)
    fechaProximo.setDate(fechaProximo.getDate() + dias)

    const msxDia       = 1000 * 60 * 60 * 24
    const diasRestantes = Math.ceil((fechaProximo - hoy) / msxDia) // negativo = atraso
    const estaAlCorriente = diasRestantes >= 0

    // Períodos sin pagar (cuántos ciclos han pasado sin pago)
    const periodosSinPagar = estaAlCorriente
      ? 0
      : Math.floor(Math.abs(diasRestantes) / dias)

    res.json({
      id_cuenta:          cuenta.id_cuenta,
      fecha_ultimo_pago:  cuenta.fecha_ultimo_pago,
      fecha_proximo_pago: fechaProximo,
      dias_restantes:     diasRestantes,
      esta_al_corriente:  estaAlCorriente,
      periodos_sin_pagar: periodosSinPagar,
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular cumplimiento', detalle: error.message })
  }
})

// ── 1. GET /api/cuentas/verificar-vencimientos ────────────────────────────────

router.get('/verificar-vencimientos', auth, async (req, res) => {
  try {
    const ahora = new Date()

    const cuentas = await prisma.cuenta.findMany({
      where: {
        estado_cuenta:  { in: ['activa', 'atraso', 'moroso'] },
        plan_actual:    { not: 'largo_plazo' },
        fecha_limite:   { lt: ahora },
      },
      include: {
        cliente: { select: { nombre: true, numero_cuenta: true } },
        venta: {
          include: {
            detalles: {
              include: {
                producto_rel: {
                  select: {
                    aplica_2_meses: true, precio_2_meses: true,
                    aplica_3_meses: true, precio_3_meses: true,
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { semanas_atraso: 'desc' }
    })

    const resultado = cuentas.map(c => {
      const detalles      = c.venta?.detalles || []
      const nuevoPlan     = siguientePlanAplicable(c.plan_actual, detalles)
      const totalAbonado  = parseFloat(c.precio_plan_actual) - parseFloat(c.saldo_actual)
      const precioNuevo   = nuevoPlan ? calcularPrecioNuevoPlan(detalles, nuevoPlan, c.precio_original_total) : null
      const nuevoSaldo    = nuevoPlan ? Math.max(0, precioNuevo - totalAbonado) : null

      return {
        id_cuenta:          c.id_cuenta,
        folio_cuenta:       c.folio_cuenta,
        cliente:            c.cliente,
        plan_actual:        c.plan_actual,
        semanas_atraso:     c.semanas_atraso,
        fecha_limite:       c.fecha_limite,
        saldo_actual:       parseFloat(c.saldo_actual),
        nuevo_plan_sugerido: nuevoPlan,
        precio_nuevo_plan:  precioNuevo,
        nuevo_saldo:        nuevoSaldo,
      }
    })

    res.json(resultado)
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar vencimientos', detalle: error.message })
  }
})

// ── 2. POST /api/cuentas/:id/cambiar-plan ─────────────────────────────────────

router.post('/:id/cambiar-plan', auth, async (req, res) => {
  try {
    if (req.usuario.rol !== 'administrador') {
      return res.status(403).json({ error: 'Solo el administrador puede cambiar el plan' })
    }

    const id_cuenta = parseInt(req.params.id)
    const { nuevo_plan } = req.body

    if (!nuevo_plan) return res.status(400).json({ error: 'Se requiere nuevo_plan' })

    const cuenta = await cargarCuentaCompleta(id_cuenta)
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' })

    if (cuenta.estado_cuenta === 'liquidada' || cuenta.estado_cuenta === 'cancelada') {
      return res.status(400).json({ error: `No se puede cambiar el plan de una cuenta ${cuenta.estado_cuenta}` })
    }

    if (cuenta.plan_actual === 'largo_plazo') {
      return res.status(400).json({ error: 'El plan largo plazo es el último nivel y no puede cambiarse' })
    }

    const detalles = cuenta.venta?.detalles || []

    if (!planAplicaEnDetalles(detalles, nuevo_plan)) {
      return res.status(400).json({ error: `Los productos de esta venta no aplican para el plan ${LABEL_PLAN[nuevo_plan] || nuevo_plan}` })
    }

    const totalAbonado   = parseFloat(cuenta.precio_plan_actual) - parseFloat(cuenta.saldo_actual)
    const precioNuevoPlan = calcularPrecioNuevoPlan(detalles, nuevo_plan, cuenta.precio_original_total)
    const nuevoSaldo      = Math.max(0, parseFloat((precioNuevoPlan - totalAbonado).toFixed(2)))
    const nuevasSemanas   = SEMANAS_POR_PLAN[nuevo_plan] || 52
    const nuevaFechaLimite = new Date(Date.now() + nuevasSemanas * 7 * 24 * 60 * 60 * 1000)
    const nuevoEstado     = nuevoSaldo === 0 ? 'liquidada' : cuenta.estado_cuenta

    const hoyStr = new Date().toLocaleDateString('es-MX')
    const notaObs = `Plan cambiado de ${LABEL_PLAN[cuenta.plan_actual]} a ${LABEL_PLAN[nuevo_plan]} el ${hoyStr} por incumplimiento.`
    const obsActualizada = cuenta.observaciones
      ? `${cuenta.observaciones} | ${notaObs}`
      : notaObs

    const cuentaActualizada = await prisma.cuenta.update({
      where: { id_cuenta },
      data: {
        plan_actual:         nuevo_plan,
        precio_plan_actual:  precioNuevoPlan,
        saldo_actual:        nuevoSaldo,
        semanas_plazo:       nuevasSemanas,
        fecha_limite:        nuevaFechaLimite,
        beneficio_vigente:   false,
        nivel_reestructura:  cuenta.nivel_reestructura + 1,
        estado_cuenta:       nuevoEstado,
        observaciones:       obsActualizada,
      }
    })

    // Si quedó en $0, sincronizar estatus de la venta
    if (nuevoSaldo === 0) {
      await prisma.venta.update({
        where: { id_venta: cuenta.id_venta },
        data:  { estatus_venta: 'liquidada' }
      })
    }

    res.json({
      mensaje:        'Plan actualizado correctamente',
      plan_anterior:  cuenta.plan_actual,
      plan_nuevo:     nuevo_plan,
      precio_anterior: parseFloat(cuenta.precio_plan_actual),
      precio_nuevo:   precioNuevoPlan,
      saldo_anterior: parseFloat(cuenta.saldo_actual),
      saldo_nuevo:    nuevoSaldo,
      cuenta:         cuentaActualizada,
    })
  } catch (error) {
    res.status(500).json({ error: 'Error al cambiar plan', detalle: error.message })
  }
})

// ── 3. POST /api/cuentas/procesar-vencimientos ────────────────────────────────

router.post('/procesar-vencimientos', auth, async (req, res) => {
  try {
    if (req.usuario.rol !== 'administrador') {
      return res.status(403).json({ error: 'Solo el administrador puede procesar vencimientos' })
    }

    const ahora = new Date()
    const cuentasVencidas = await prisma.cuenta.findMany({
      where: {
        estado_cuenta: { in: ['activa', 'atraso', 'moroso'] },
        plan_actual:   { not: 'largo_plazo' },
        fecha_limite:  { lt: ahora },
      },
      include: {
        venta: {
          include: {
            detalles: {
              include: {
                producto_rel: {
                  select: {
                    aplica_2_meses: true, precio_2_meses: true,
                    aplica_3_meses: true, precio_3_meses: true,
                  }
                }
              }
            }
          }
        }
      }
    })

    let procesadas = 0
    let omitidas   = 0
    const errores  = []

    for (const cuenta of cuentasVencidas) {
      const detalles  = cuenta.venta?.detalles || []
      const nuevoPlan = siguientePlanAplicable(cuenta.plan_actual, detalles)

      if (!nuevoPlan) { omitidas++; continue }

      try {
        const totalAbonado    = parseFloat(cuenta.precio_plan_actual) - parseFloat(cuenta.saldo_actual)
        const precioNuevoPlan = calcularPrecioNuevoPlan(detalles, nuevoPlan, cuenta.precio_original_total)
        const nuevoSaldo      = Math.max(0, parseFloat((precioNuevoPlan - totalAbonado).toFixed(2)))
        const nuevasSemanas   = SEMANAS_POR_PLAN[nuevoPlan] || 52
        const nuevaFechaLimite = new Date(Date.now() + nuevasSemanas * 7 * 24 * 60 * 60 * 1000)
        const nuevoEstado     = nuevoSaldo === 0 ? 'liquidada' : cuenta.estado_cuenta

        const hoyStr = new Date().toLocaleDateString('es-MX')
        const notaObs = `Plan cambiado de ${LABEL_PLAN[cuenta.plan_actual]} a ${LABEL_PLAN[nuevoPlan]} el ${hoyStr} por incumplimiento.`
        const obsActualizada = cuenta.observaciones ? `${cuenta.observaciones} | ${notaObs}` : notaObs

        await prisma.cuenta.update({
          where: { id_cuenta: cuenta.id_cuenta },
          data: {
            plan_actual:        nuevoPlan,
            precio_plan_actual: precioNuevoPlan,
            saldo_actual:       nuevoSaldo,
            semanas_plazo:      nuevasSemanas,
            fecha_limite:       nuevaFechaLimite,
            beneficio_vigente:  false,
            nivel_reestructura: cuenta.nivel_reestructura + 1,
            estado_cuenta:      nuevoEstado,
            observaciones:      obsActualizada,
          }
        })

        if (nuevoSaldo === 0) {
          await prisma.venta.update({
            where: { id_venta: cuenta.id_venta },
            data:  { estatus_venta: 'liquidada' }
          })
        }

        procesadas++
      } catch (e) {
        errores.push({ id_cuenta: cuenta.id_cuenta, error: e.message })
      }
    }

    res.json({ mensaje: 'Proceso completado', procesadas, omitidas, errores })
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar vencimientos', detalle: error.message })
  }
})

module.exports = router
