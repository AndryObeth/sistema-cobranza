const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SELECT_USUARIO = {
  id_usuario: true,
  nombre: true,
  usuario: true,
  rol: true,
  ruta_asignada: true,
  activo: true,
  fecha_creacion: true
}

// GET /api/usuarios — listar todos (activos e inactivos)
router.get('/', auth, async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      orderBy: { nombre: 'asc' },
      select: SELECT_USUARIO
    })
    res.json(usuarios)
  } catch {
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// POST /api/usuarios — crear nuevo usuario
router.post('/', auth, async (req, res) => {
  try {
    const { nombre, usuario, contrasena, rol, ruta_asignada } = req.body

    const existe = await prisma.usuario.findUnique({ where: { usuario } })
    if (existe) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' })
    }

    const hash = await bcrypt.hash(contrasena, 10)

    const nuevo = await prisma.usuario.create({
      data: { nombre, usuario, contrasena: hash, rol, ruta_asignada },
      select: SELECT_USUARIO
    })
    res.status(201).json(nuevo)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuario', detalle: error.message })
  }
})

// PUT /api/usuarios/:id — editar datos del usuario
router.put('/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { nombre, usuario, rol, ruta_asignada, activo } = req.body

    // Verificar que el nombre de usuario no esté tomado por otro
    if (usuario) {
      const existe = await prisma.usuario.findFirst({
        where: { usuario, NOT: { id_usuario: id } }
      })
      if (existe) {
        return res.status(400).json({ error: 'El nombre de usuario ya está en uso' })
      }
    }

    const actualizado = await prisma.usuario.update({
      where: { id_usuario: id },
      data: {
        ...(nombre        !== undefined && { nombre }),
        ...(usuario       !== undefined && { usuario }),
        ...(rol           !== undefined && { rol }),
        ...(ruta_asignada !== undefined && { ruta_asignada }),
        ...(activo        !== undefined && { activo }),
      },
      select: SELECT_USUARIO
    })
    res.json(actualizado)
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar usuario', detalle: error.message })
  }
})

// PUT /api/usuarios/:id/password — cambiar contraseña
router.put('/:id/password', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { nueva_contrasena } = req.body

    if (!nueva_contrasena || nueva_contrasena.trim() === '') {
      return res.status(400).json({ error: 'La nueva contraseña no puede estar vacía' })
    }

    const hash = await bcrypt.hash(nueva_contrasena, 10)
    await prisma.usuario.update({
      where: { id_usuario: id },
      data: { contrasena: hash }
    })
    res.json({ mensaje: 'Contraseña actualizada correctamente' })
  } catch (error) {
    res.status(500).json({ error: 'Error al cambiar contraseña', detalle: error.message })
  }
})

module.exports = router
