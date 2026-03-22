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

app.get('/', (req, res) => {
  res.json({ mensaje: 'Sistema cobranza activo ✅' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})