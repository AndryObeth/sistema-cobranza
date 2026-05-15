const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const soloAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'administrador') {
    return res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' })
  }
  next()
}

// GET /api/lista-negra — todos los registros activos (todos los roles)
router.get('/', auth, async (req, res) => {
  try {
    const { q } = req.query
    const where = { activo: true }
    if (q) {
      const busq = q.toLowerCase()
      where.OR = [
        { nombre:    { contains: busq, mode: 'insensitive' } },
        { alias:     { contains: busq, mode: 'insensitive' } },
        { telefono:  { contains: busq, mode: 'insensitive' } },
        { municipio: { contains: busq, mode: 'insensitive' } },
        { colonia:   { contains: busq, mode: 'insensitive' } },
      ]
    }
    const registros = await prisma.listaNegra.findMany({
      where,
      orderBy: { fecha_registro: 'desc' },
      include: { registrado_por: { select: { nombre: true } } }
    })
    res.json(registros)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lista negra', detalle: error.message })
  }
})

// POST /api/lista-negra — agregar (solo admin)
router.post('/', auth, soloAdmin, async (req, res) => {
  try {
    const { nombre, alias, telefono, municipio, colonia, motivo, observaciones } = req.body
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
    if (!motivo?.trim()) return res.status(400).json({ error: 'El motivo es obligatorio' })
    const registro = await prisma.listaNegra.create({
      data: {
        nombre:        nombre.trim(),
        alias:         alias?.trim()        || null,
        telefono:      telefono?.trim()     || null,
        municipio:     municipio?.trim()    || null,
        colonia:       colonia?.trim()      || null,
        motivo:        motivo.trim(),
        observaciones: observaciones?.trim() || null,
        id_usuario_registro: req.usuario.id,
      },
      include: { registrado_por: { select: { nombre: true } } }
    })
    res.status(201).json(registro)
  } catch (error) {
    res.status(500).json({ error: 'Error al agregar a lista negra', detalle: error.message })
  }
})

// PUT /api/lista-negra/:id — editar (solo admin)
router.put('/:id', auth, soloAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { nombre, alias, telefono, municipio, colonia, motivo, observaciones } = req.body
    const data = {}
    if (nombre        !== undefined) data.nombre        = nombre.trim()
    if (alias         !== undefined) data.alias         = alias?.trim()        || null
    if (telefono      !== undefined) data.telefono      = telefono?.trim()     || null
    if (municipio     !== undefined) data.municipio     = municipio?.trim()    || null
    if (colonia       !== undefined) data.colonia       = colonia?.trim()      || null
    if (motivo        !== undefined) data.motivo        = motivo.trim()
    if (observaciones !== undefined) data.observaciones = observaciones?.trim() || null
    const registro = await prisma.listaNegra.update({
      where: { id_lista_negra: id },
      data,
      include: { registrado_por: { select: { nombre: true } } }
    })
    res.json(registro)
  } catch (error) {
    res.status(500).json({ error: 'Error al editar registro', detalle: error.message })
  }
})

// DELETE /api/lista-negra/:id — dar de baja (solo admin, soft delete)
router.delete('/:id', auth, soloAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    await prisma.listaNegra.update({
      where: { id_lista_negra: id },
      data: { activo: false }
    })
    res.json({ mensaje: 'Registro eliminado de la lista negra' })
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar registro', detalle: error.message })
  }
})

module.exports = router
