const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/usuarios — listar todos
router.get('/', auth, async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: {
        id_usuario: true,
        nombre: true,
        usuario: true,
        rol: true,
        ruta_asignada: true,
        activo: true,
        fecha_creacion: true
      }
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
      select: {
        id_usuario: true,
        nombre: true,
        usuario: true,
        rol: true,
        ruta_asignada: true,
        activo: true,
        fecha_creacion: true
      }
    })
    res.status(201).json(nuevo)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuario', detalle: error.message })
  }
})

module.exports = router
