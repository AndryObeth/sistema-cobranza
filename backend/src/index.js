const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

// Rutas
app.use('/api/auth',      require('./routes/auth'))
app.use('/api/clientes',  require('./routes/clientes'))
app.use('/api/productos', require('./routes/productos'))
app.use('/api/ventas',    require('./routes/ventas'))
app.use('/api/pagos',     require('./routes/pagos'))
app.use('/api/usuarios',  require('./routes/usuarios'))
app.use('/api/visitas',    require('./routes/visitas'))
app.use('/api/dashboard', require('./routes/dashboard'))
app.use('/api/cortes',   require('./routes/cortes'))
app.use('/api/cuentas',  require('./routes/cuentas'))
app.use('/api/uploads', require('./routes/uploads'))

app.get('/', (req, res) => {
  res.json({ mensaje: 'Sistema cobranza activo ✅', version: 'b9f7555' })
})

// Diagnóstico temporal — borrar después
app.get('/diagnostico', async (req, res) => {
  const { PrismaClient } = require('@prisma/client')
  const p = new PrismaClient()
  try {
    const campos = Object.keys(p.cliente.fields || {})
    const total  = await p.cliente.count()
    res.json({ prisma_campos_cliente: campos, total_clientes: total })
  } catch (e) {
    res.json({ error: String(e), message: e.message })
  } finally {
    await p.$disconnect()
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})