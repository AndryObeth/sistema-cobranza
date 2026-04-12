const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// POST /api/visitas — registrar visita/seguimiento
router.post('/', auth, async (req, res) => {
  try {
    const { id_cliente, id_cuenta, tipo_seguimiento, comentario, fecha_programada } = req.body

    const visita = await prisma.seguimientoCliente.create({
      data: {
        id_cliente: parseInt(id_cliente),
        id_cuenta: id_cuenta ? parseInt(id_cuenta) : null,
        id_usuario: req.usuario.id,
        tipo_seguimiento,
        comentario: comentario || null,
        fecha_programada: fecha_programada ? new Date(fecha_programada) : null
      },
      include: {
        usuario: { select: { nombre: true, rol: true } },
        cliente: { select: { nombre: true } }
      }
    })

    res.status(201).json(visita)
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar visita', detalle: error.message })
  }
})

// GET /api/visitas/pendientes/:id_cobrador — visitas pendientes de un cobrador
router.get('/pendientes/:id_cobrador', auth, async (req, res) => {
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const visitas = await prisma.seguimientoCliente.findMany({
      where: {
        id_usuario: parseInt(req.params.id_cobrador),
        fecha_programada: { gte: hoy }
      },
      include: {
        cliente: { select: { nombre: true, numero_cuenta: true } },
        usuario: { select: { nombre: true, rol: true } }
      },
      orderBy: { fecha_programada: 'asc' }
    })

    res.json(visitas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener visitas pendientes' })
  }
})

// GET /api/visitas/todas-pendientes — todas las visitas pendientes (admin/cobrador)
router.get('/todas-pendientes', auth, async (req, res) => {
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const where = { fecha_programada: { gte: hoy } }
    if (req.usuario.rol === 'cobrador' && req.usuario.ruta_asignada) {
      where.cliente = { ruta: req.usuario.ruta_asignada }
    }

    const visitas = await prisma.seguimientoCliente.findMany({
      where,
      include: {
        cliente: { select: { nombre: true, numero_cuenta: true } },
        usuario: { select: { nombre: true, rol: true } }
      },
      orderBy: { fecha_programada: 'asc' }
    })

    res.json(visitas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener visitas pendientes' })
  }
})

// GET /api/visitas/cobros-sugeridos — cuentas activas con info de frecuencia y cobrador
router.get('/cobros-sugeridos', auth, async (req, res) => {
  try {
    const where = { estado_cuenta: { in: ['activa', 'atraso', 'moroso'] } }
    if (req.usuario.rol === 'cobrador') {
      where.venta = { id_cobrador: req.usuario.id }
    }

    const cuentas = await prisma.cuenta.findMany({
      where,
      select: {
        id_cuenta:         true,
        numero_cuenta:     true,
        frecuencia_pago:   true,
        fecha_primer_cobro: true,
        fecha_ultimo_pago: true,
        horario_preferido: true,
        saldo_actual:      true,
        estado_cuenta:     true,
        cliente: { select: { nombre: true, numero_expediente: true } },
        venta:   { select: { cobrador: { select: { id_usuario: true, nombre: true } } } }
      }
    })

    res.json(cuentas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cobros sugeridos', detalle: error.message })
  }
})

// GET /api/visitas/cuenta/:id_cuenta — historial de visitas de una cuenta
router.get('/cuenta/:id_cuenta', auth, async (req, res) => {
  try {
    const visitas = await prisma.seguimientoCliente.findMany({
      where: { id_cuenta: parseInt(req.params.id_cuenta) },
      include: {
        usuario: { select: { nombre: true } }
      },
      orderBy: { fecha_registro: 'desc' }
    })

    res.json(visitas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial de visitas' })
  }
})

module.exports = router
