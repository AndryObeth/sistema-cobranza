const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']

    if (!authHeader) {
      return res.status(401).json({ error: 'Token requerido' })
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader

    if (!token) {
      return res.status(401).json({ error: 'Token vacío' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // El token solo prueba identidad; rol/rutas/estado siempre se leen frescos de la BD
    // para que un cambio del admin (rol, rutas asignadas, desactivar) aplique de inmediato,
    // sin esperar a que el usuario cierre sesión y el token viejo expire.
    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: decoded.id },
      select: { id_usuario: true, nombre: true, rol: true, rutas_asignadas: true, activo: true }
    })
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' })
    }

    req.usuario = {
      id: usuario.id_usuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
      rutas_asignadas: usuario.rutas_asignadas
    }
    next()
  } catch (error) {
    console.log('Error JWT:', error.message)
    return res.status(403).json({ error: 'Token inválido', detalle: error.message })
  }
}