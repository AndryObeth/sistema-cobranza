const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const GMAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyCyxJz71a1Sxghckwxiq00PKckjbSeK0vg'

async function geocodearPlusCode(plusCode) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(plusCode)}&key=${GMAPS_KEY}`
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status === 'OK' && data.results?.[0]) {
      return data.results[0].geometry.location // { lat, lng }
    }
  } catch {}
  return null
}

async function plusCodeDesdeCoordenadas(lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAPS_KEY}`
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status === 'OK') {
      return data.plus_code?.global_code || null
    }
  } catch {}
  return null
}

// GET /api/clientes — listar todos
router.get('/', auth, async (req, res) => {
  try {
    const where = { activo: true }
    if (req.usuario.rol === 'cobrador' && req.usuario.ruta_asignada) {
      where.ruta = req.usuario.ruta_asignada
    }
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' }
    })
    res.json(clientes)
  } catch {
    res.status(500).json({ error: 'Error al obtener clientes' })
  }
})

// GET /api/clientes/:id — detalle de un cliente
router.get('/:id', auth, async (req, res) => {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id_cliente: parseInt(req.params.id) },
      include: {
        cuentas: {
          orderBy: { fecha_inicio: 'desc' }
        },
        ventas: {
          orderBy: { fecha_venta: 'desc' },
          include: {
            detalles: true,
            vendedor: { select: { nombre: true } }
          }
        },
        seguimientos: {
          orderBy: { fecha_registro: 'desc' },
          take: 10,
          include: {
            usuario: { select: { nombre: true } }
          }
        }
      }
    })
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(cliente)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cliente', detalle: error.message })
  }
})

// POST /api/clientes/importar-lote — inserción masiva (debe ir antes de /:id)
router.post('/importar-lote', auth, async (req, res) => {
  if (req.usuario.rol !== 'administrador') {
    return res.status(403).json({ error: 'Solo el administrador puede importar clientes' })
  }
  const clientes = req.body // array de clientes
  if (!Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de clientes' })
  }

  const resultados = { creados: 0, reactivados: 0, omitidos: [], errores: [] }

  for (const data of clientes) {
    if (!data.numero_expediente) { resultados.errores.push({ cliente: data.nombre, error: 'Falta numero_expediente' }); continue }
    try {
      const existente = await prisma.cliente.findUnique({ where: { numero_expediente: data.numero_expediente } })
      if (existente) {
        if (existente.activo) {
          resultados.omitidos.push({ numero_expediente: data.numero_expediente, nombre: data.nombre, motivo: 'Ya existe y está activo' })
          continue
        }
        await prisma.cliente.update({
          where: { id_cliente: existente.id_cliente },
          data: { ...data, activo: true, id_vendedor_alta: req.usuario.id }
        })
        resultados.reactivados++
      } else {
        await prisma.cliente.create({
          data: { ...data, id_vendedor_alta: req.usuario.id }
        })
        resultados.creados++
      }
    } catch (e) {
      resultados.errores.push({ cliente: data.nombre, error: e.message })
    }
  }

  res.status(201).json({ mensaje: 'Importación completada', ...resultados })
})

// POST /api/clientes — crear cliente
router.post('/', auth, async (req, res) => {
  try {
    const b = req.body

    const ultimo = await prisma.cliente.findFirst({
      orderBy: { numero_expediente: 'desc' },
      select:  { numero_expediente: true }
    })
    const siguiente = ultimo ? parseInt(ultimo.numero_expediente, 10) + 1 : 1
    const numero_expediente = String(siguiente).padStart(4, '0')

    const data = {
      numero_expediente,
      nombre:                  b.nombre                  || '',
      alias:                   b.alias                   || null,
      telefono:                b.telefono                || null,
      municipio:               b.municipio               || null,
      colonia:                 b.colonia                 || null,
      direccion:               b.direccion               || null,
      referencias:             b.referencias             || null,
      ruta:                    b.ruta                    || null,
      estado_cliente:          b.estado_cliente          || 'activo',
      nivel_riesgo:            b.nivel_riesgo            || null,
      observaciones_generales: b.observaciones_generales || null,
      id_vendedor_alta:        req.usuario.id,
    }

    // Campos agregados en migraciones posteriores — solo incluir si el cliente los conoce
    if (b.latitud  != null) data.latitud  = parseFloat(b.latitud)
    if (b.longitud != null) data.longitud = parseFloat(b.longitud)
    if (b.plus_code)        data.plus_code = b.plus_code

    const cliente = await prisma.cliente.create({ data })
    res.status(201).json(cliente)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear cliente', detalle: error.message })
  }
})

// POST /api/clientes/geocodificar-lote — geocodifica clientes sin coordenadas (server-side)
router.post('/geocodificar-lote', auth, async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_KEY
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_MAPS_KEY no configurada en el servidor' })

  const where = { activo: true, OR: [{ latitud: null }, { longitud: null }] }
  if (req.usuario.rol === 'cobrador' && req.usuario.ruta_asignada) {
    where.ruta = req.usuario.ruta_asignada
  }
  const clientes = await prisma.cliente.findMany({
    where,
    select: { id_cliente: true, nombre: true, direccion: true, colonia: true, municipio: true }
  })

  let exitosos = 0
  const fallidos = []
  const errores_detalle = []

  for (const c of clientes) {
    const intentos = [
      [c.direccion, c.colonia, c.municipio, 'Oaxaca, México'].filter(Boolean).join(', '),
      [c.municipio, 'Oaxaca, México'].filter(Boolean).join(', '),
    ]

    let colocado = false
    let ultimoStatus = null
    for (const dir of intentos) {
      if (!dir.trim() || colocado) continue
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(dir)}&key=${apiKey}`
        const resp = await fetch(url)
        const data = await resp.json()
        ultimoStatus = data.status
        if (data.status === 'OK' && data.results?.[0]) {
          const { lat, lng } = data.results[0].geometry.location
          await prisma.cliente.update({
            where: { id_cliente: c.id_cliente },
            data: { latitud: lat, longitud: lng }
          })
          exitosos++
          colocado = true
        }
      } catch (err) {
        ultimoStatus = err.message
      }
    }
    if (!colocado) {
      fallidos.push(c.nombre)
      errores_detalle.push({ nombre: c.nombre, status: ultimoStatus })
    }
  }

  res.json({ total: clientes.length, exitosos, fallidos, errores_detalle })
})

// GET /api/clientes/sin-coordenadas — clientes sin lat/lng
router.get('/sin-coordenadas', auth, async (req, res) => {
  try {
    const where = { activo: true, OR: [{ latitud: null }, { longitud: null }] }
    if (req.usuario.rol === 'cobrador' && req.usuario.ruta_asignada) {
      where.ruta = req.usuario.ruta_asignada
    }
    const clientes = await prisma.cliente.findMany({
      where,
      select: { id_cliente: true, nombre: true, direccion: true, municipio: true, colonia: true, ruta: true }
    })
    res.json(clientes)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes', detalle: error.message })
  }
})

// PUT /api/clientes/:id/coordenadas — guardar lat/lng (y plus_code opcional) de un cliente
router.put('/:id/coordenadas', auth, async (req, res) => {
  try {
    const { latitud, longitud, plus_code } = req.body
    if (latitud == null || longitud == null) {
      return res.status(400).json({ error: 'Se requieren latitud y longitud' })
    }
    const data = { latitud: parseFloat(latitud), longitud: parseFloat(longitud) }
    if (plus_code) data.plus_code = plus_code
    const cliente = await prisma.cliente.update({
      where: { id_cliente: parseInt(req.params.id) },
      data
    })
    res.json({ ok: true, latitud: cliente.latitud, longitud: cliente.longitud, plus_code: cliente.plus_code })
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar coordenadas', detalle: error.message })
  }
})

// PUT /api/clientes/:id/plus-code — guardar plus_code y opcionalmente geocodear
router.put('/:id/plus-code', auth, async (req, res) => {
  try {
    const { plus_code } = req.body
    const data = { plus_code: plus_code || null }

    // Si tiene coordenadas el cliente, generar plus_code desde ellas si no se proveyó
    if (!plus_code) {
      const actual = await prisma.cliente.findUnique({
        where: { id_cliente: parseInt(req.params.id) },
        select: { latitud: true, longitud: true }
      })
      if (actual?.latitud && actual?.longitud) {
        data.plus_code = await plusCodeDesdeCoordenadas(actual.latitud, actual.longitud)
      }
    }

    const cliente = await prisma.cliente.update({
      where: { id_cliente: parseInt(req.params.id) },
      data
    })
    res.json({ plus_code: cliente.plus_code })
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar plus code', detalle: error.message })
  }
})

// PUT /api/clientes/:id — actualizar cliente
router.put('/:id', auth, async (req, res) => {
  try {
    const b = req.body

    const data = {
      nombre:                  b.nombre                  || '',
      alias:                   b.alias                   || null,
      telefono:                b.telefono                || null,
      municipio:               b.municipio               || null,
      colonia:                 b.colonia                 || null,
      direccion:               b.direccion               || null,
      referencias:             b.referencias             || null,
      ruta:                    b.ruta                    || null,
      estado_cliente:          b.estado_cliente          || 'activo',
      nivel_riesgo:            b.nivel_riesgo            || null,
      observaciones_generales: b.observaciones_generales || null,
    }

    if (b.latitud  != null) data.latitud  = parseFloat(b.latitud)
    if (b.longitud != null) data.longitud = parseFloat(b.longitud)
    if (b.plus_code) {
      data.plus_code = b.plus_code
      if (!b.latitud) {
        const coords = await geocodearPlusCode(b.plus_code)
        if (coords) { data.latitud = coords.lat; data.longitud = coords.lng }
      }
    }

    const cliente = await prisma.cliente.update({
      where: { id_cliente: parseInt(req.params.id) },
      data
    })
    res.json(cliente)
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar cliente', detalle: error.message })
  }
})

module.exports = router