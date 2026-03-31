const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/clientes — listar todos
router.get('/', auth, async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    })
    res.json(clientes)
  } catch {
    res.status(500).json({ error: 'Error al obtener clientes' })
  }
})

// GET /api/clientes/:id — detalle de un cliente
router.get('/:id', auth, async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id_cliente: parseInt(req.params.id) },
      include: {
        cuentas: {
          orderBy: { fecha_inicio: 'desc' }
        },
        ventas: {
          orderBy: { fecha_venta: 'desc' },
          include: {
            detalles: true,
            vendedor: { select: { nombre: true } }
          }
        },
        seguimientos: {
          orderBy: { fecha_registro: 'desc' },
          take: 10,
          include: {
            usuario: { select: { nombre: true } }
          }
        }
      }
    })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(cliente)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cliente', detalle: error.message })
  }
})

// POST /api/clientes — crear cliente
router.post('/', auth, async (req, res) => {
  try {
    const data = req.body
    const numero_cuenta = 'NC-' + Date.now()

    const cliente = await prisma.cliente.create({
      data: {
        ...data,
        numero_cuenta,
        id_vendedor_alta: req.usuario.id
      }
    })
    res.status(201).json(cliente)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear cliente', detalle: error.message })
  }
})

// PUT /api/clientes/:id — actualizar cliente
router.put('/:id', auth, async (req, res) => {
  try {
    const cliente = await prisma.cliente.update({
      where: { id_cliente: parseInt(req.params.id) },
      data: req.body
    })
    res.json(cliente)
  } catch {
    res.status(500).json({ error: 'Error al actualizar cliente' })
  }
})

module.exports = router