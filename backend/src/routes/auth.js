const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Máximo 10 intentos de login por IP cada 15 minutos, para frenar fuerza bruta.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' }
})

// POST /api/auth/login
router.post('/login', limitadorLogin, async (req, res) => {
  try {
    const { usuario, contrasena } = req.body

    const user = await prisma.usuario.findUnique({
      where: { usuario }
    })

    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' })
    }

    const valido = await bcrypt.compare(contrasena, user.contrasena)
    if (!valido) {
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    const token = jwt.sign(
      { id: user.id_usuario, rol: user.rol, nombre: user.nombre, rutas_asignadas: user.rutas_asignadas },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        rol: user.rol,
        rutas_asignadas: user.rutas_asignadas
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' })
  }
})

module.exports = router