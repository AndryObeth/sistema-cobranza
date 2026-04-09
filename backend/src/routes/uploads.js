const express = require('express')
const router = express.Router()
const multer = require('multer')
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Almacena en memoria → convierte a base64 y guarda en la BD
// (evita dependencia del sistema de archivos, que es efímero en Render)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Solo se permiten imágenes'))
  }
})

// POST /api/uploads/fachada/:id_cliente
router.post('/fachada/:id_cliente', auth, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`

    await prisma.cliente.update({
      where: { id_cliente: parseInt(req.params.id_cliente) },
      data: { foto_fachada: base64 }
    })

    res.json({ ok: true, foto_fachada: base64 })
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar foto', detalle: error.message })
  }
})

// GET /api/uploads/fachada/:id_cliente — devuelve la imagen como binario
router.get('/fachada/:id_cliente', auth, async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id_cliente: parseInt(req.params.id_cliente) },
      select: { foto_fachada: true }
    })
    if (!cliente?.foto_fachada) return res.status(404).json({ error: 'Sin foto registrada' })

    const match = cliente.foto_fachada.match(/^data:(.+);base64,(.+)$/)
    if (!match) return res.status(500).json({ error: 'Formato inválido' })

    const [, mimeType, base64Data] = match
    res.setHeader('Content-Type', mimeType)
    res.send(Buffer.from(base64Data, 'base64'))
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener foto' })
  }
})

module.exports = router
