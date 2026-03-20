const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
      { id: user.id_usuario, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      usuario: {
        id: user.id_usuario,
        nombre: user.nombre,
        rol: user.rol,
        ruta_asignada: user.ruta_asignada
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' })
  }
})

module.exports = router