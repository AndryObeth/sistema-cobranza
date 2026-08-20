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
  rutas_asignadas: true,
  activo: true,
  fecha_creacion: true
}

// GET /api/usuarios — listar todos (activos e inactivos); ?rol=vendedor para filtrar
router.get('/', auth, async (req, res) => {
  try {
    const where = {}
    if (req.query.rol) where.rol = req.query.rol
    const usuarios = await prisma.usuario.findMany({
      where,
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
    const { nombre, usuario, contrasena, rol, rutas_asignadas } = req.body

    const existe = await prisma.usuario.findUnique({ where: { usuario } })
    if (existe) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' })
    }

    const hash = await bcrypt.hash(contrasena, 10)

    const nuevo = await prisma.usuario.create({
      data: { nombre, usuario, contrasena: hash, rol, rutas_asignadas: rutas_asignadas || [] },
      select: SELECT_USUARIO
    })
    res.status(201).json(nuevo)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuario', detalle: error.message })
  }
})

// GET /api/usuarios/mi-orden?dia=lunes — orden de ruta guardado del cobrador autenticado para ese día
// (dia='general' cuando el cobrador no usa enrutado por día)
router.get('/mi-orden', auth, async (req, res) => {
  try {
    const dia = req.query.dia || 'general'
    const u = await prisma.usuario.findUnique({
      where: { id_usuario: req.usuario.id },
      select: { orden_ruta: true }
    })
    const guardado = u?.orden_ruta
    let orden = []
    if (Array.isArray(guardado)) {
      // Formato antiguo (un solo orden global, previo al enrutado por día)
      if (dia === 'general') orden = guardado
    } else if (guardado && typeof guardado === 'object') {
      orden = guardado[dia] ?? []
    }
    res.json({ orden })
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener orden de ruta', detalle: error.message })
  }
})

// PUT /api/usuarios/mi-orden — guardar orden de ruta del cobrador autenticado para un día
router.put('/mi-orden', auth, async (req, res) => {
  try {
    const { orden, dia } = req.body
    if (!Array.isArray(orden)) return res.status(400).json({ error: 'orden debe ser un array' })
    const clave = dia || 'general'
    const u = await prisma.usuario.findUnique({
      where: { id_usuario: req.usuario.id },
      select: { orden_ruta: true }
    })
    const actual = (u?.orden_ruta && !Array.isArray(u.orden_ruta)) ? u.orden_ruta : {}
    await prisma.usuario.update({
      where: { id_usuario: req.usuario.id },
      data: { orden_ruta: { ...actual, [clave]: orden } }
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar orden de ruta', detalle: error.message })
  }
})

// PUT /api/usuarios/:id — editar datos del usuario
router.put('/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { nombre, usuario, rol, rutas_asignadas, activo } = req.body

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
        ...(rol             !== undefined && { rol }),
        ...(rutas_asignadas !== undefined && { rutas_asignadas }),
        ...(activo          !== undefined && { activo }),
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
