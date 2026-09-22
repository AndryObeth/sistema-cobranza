const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const soloAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'administrador') {
    return res.status(403).json({ error: 'Solo el administrador puede acceder a Crédito Mayoristas' })
  }
  next()
}

// GET /api/mayoristas — todos los activos, con su saldo actual
router.get('/', auth, soloAdmin, async (req, res) => {
  try {
    const mayoristas = await prisma.mayorista.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      include: { registrado_por: { select: { nombre: true } } }
    })
    res.json(mayoristas)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener mayoristas', detalle: error.message })
  }
})

// POST /api/mayoristas — crear mayorista, con saldo inicial opcional (genera un cargo)
router.post('/', auth, soloAdmin, async (req, res) => {
  try {
    const { nombre, telefono, notas, saldo_inicial, fecha } = req.body
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })

    const saldoInicial = parseFloat(saldo_inicial) || 0
    const fechaMovimiento = fecha ? new Date(fecha + 'T12:00:00') : new Date()

    const mayorista = await prisma.$transaction(async (tx) => {
      const creado = await tx.mayorista.create({
        data: {
          nombre: nombre.trim(),
          telefono: telefono?.trim() || null,
          notas: notas?.trim() || null,
          saldo_actual: saldoInicial,
          id_usuario_registro: req.usuario.id,
        }
      })

      if (saldoInicial > 0) {
        await tx.movimientoMayorista.create({
          data: {
            id_mayorista: creado.id_mayorista,
            tipo: 'cargo',
            monto: saldoInicial,
            saldo_anterior: 0,
            saldo_nuevo: saldoInicial,
            fecha: fechaMovimiento,
            observaciones: 'Saldo inicial al registrar',
            id_usuario: req.usuario.id,
          }
        })
      }

      return tx.mayorista.findUnique({
        where: { id_mayorista: creado.id_mayorista },
        include: { registrado_por: { select: { nombre: true } } }
      })
    })

    res.status(201).json(mayorista)
  } catch (error) {
    res.status(500).json({ error: 'Error al crear mayorista', detalle: error.message })
  }
})

// PUT /api/mayoristas/:id — editar datos (no el saldo — eso solo cambia vía movimientos)
router.put('/:id', auth, soloAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { nombre, telefono, notas } = req.body
    const data = {}
    if (nombre    !== undefined) data.nombre    = nombre.trim()
    if (telefono  !== undefined) data.telefono  = telefono?.trim() || null
    if (notas     !== undefined) data.notas     = notas?.trim()    || null

    const actualizado = await prisma.mayorista.update({
      where: { id_mayorista: id },
      data,
      include: { registrado_por: { select: { nombre: true } } }
    })
    res.json(actualizado)
  } catch (error) {
    res.status(500).json({ error: 'Error al editar mayorista', detalle: error.message })
  }
})

// DELETE /api/mayoristas/:id — dar de baja (soft delete)
router.delete('/:id', auth, soloAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    await prisma.mayorista.update({ where: { id_mayorista: id }, data: { activo: false } })
    res.json({ mensaje: 'Mayorista dado de baja' })
  } catch (error) {
    res.status(500).json({ error: 'Error al dar de baja', detalle: error.message })
  }
})

// GET /api/mayoristas/:id/movimientos — historial, más reciente primero
router.get('/:id/movimientos', auth, soloAdmin, async (req, res) => {
  try {
    const id_mayorista = parseInt(req.params.id)
    const movimientos = await prisma.movimientoMayorista.findMany({
      where: { id_mayorista },
      orderBy: { fecha: 'desc' },
      include: { registrado_por: { select: { nombre: true } } }
    })
    res.json(movimientos)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener movimientos', detalle: error.message })
  }
})

// POST /api/mayoristas/:id/movimientos — registrar cargo o abono
router.post('/:id/movimientos', auth, soloAdmin, async (req, res) => {
  try {
    const id_mayorista = parseInt(req.params.id)
    const { tipo, monto, fecha, observaciones } = req.body

    if (!['cargo', 'abono'].includes(tipo)) return res.status(400).json({ error: 'tipo debe ser "cargo" o "abono"' })
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' })

    const resultado = await prisma.$transaction(async (tx) => {
      const mayorista = await tx.mayorista.findUnique({ where: { id_mayorista } })
      if (!mayorista) throw new Error('NOT_FOUND')

      const saldoAnterior = parseFloat(mayorista.saldo_actual)
      const saldoNuevo = tipo === 'cargo' ? saldoAnterior + montoNum : saldoAnterior - montoNum

      const movimiento = await tx.movimientoMayorista.create({
        data: {
          id_mayorista,
          tipo,
          monto: montoNum,
          saldo_anterior: saldoAnterior,
          saldo_nuevo: saldoNuevo,
          fecha: fecha ? new Date(fecha + 'T12:00:00') : new Date(),
          observaciones: observaciones?.trim() || null,
          id_usuario: req.usuario.id,
        },
        include: { registrado_por: { select: { nombre: true } } }
      })

      await tx.mayorista.update({ where: { id_mayorista }, data: { saldo_actual: saldoNuevo } })

      return movimiento
    })

    res.status(201).json(resultado)
  } catch (error) {
    if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Mayorista no encontrado' })
    res.status(500).json({ error: 'Error al registrar movimiento', detalle: error.message })
  }
})

module.exports = router
