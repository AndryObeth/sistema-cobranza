const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/productos — listar activos
router.get('/', auth, async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { estatus: 'activo' },
      orderBy: { nombre_comercial: 'asc' }
    })
    res.json(productos)
  } catch {
    res.status(500).json({ error: 'Error al obtener productos' })
  }
})

// GET /api/productos/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const producto = await prisma.producto.findUnique({
      where: { id_producto: parseInt(req.params.id) }
    })
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(producto)
  } catch {
    res.status(500).json({ error: 'Error al obtener producto' })
  }
})

// POST /api/productos — crear producto
router.post('/', auth, async (req, res) => {
  try {
    const producto = await prisma.producto.create({ data: req.body })
    res.status(201).json(producto)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear producto', detalle: error.message })
  }
})

// PUT /api/productos/:id — actualizar producto
router.put('/:id', auth, async (req, res) => {
  try {
    const producto = await prisma.producto.update({
      where: { id_producto: parseInt(req.params.id) },
      data: req.body
    })
    res.json(producto)
  } catch {
    res.status(500).json({ error: 'Error al actualizar producto' })
  }
})

module.exports = router