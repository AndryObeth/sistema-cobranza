const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
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
    req.usuario = decoded
    next()
  } catch (error) {
    console.log('Error JWT:', error.message)
    return res.status(403).json({ error: 'Token inválido', detalle: error.message })
  }
}