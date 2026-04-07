const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  const cobradores = [
    { nombre: 'Juan', usuario: 'juan', contrasena: 'juan1234', ruta_asignada: 'A' },
    { nombre: 'Casimiro', usuario: 'casimiro', contrasena: 'casimiro1234', ruta_asignada: 'B' },
    { nombre: 'Vicente', usuario: 'vicente', contrasena: 'vicente1234', ruta_asignada: 'C' },
  ]

  for (const c of cobradores) {
    const hash = await bcrypt.hash(c.contrasena, 10)
    await prisma.usuario.create({
      data: {
        nombre: c.nombre,
        usuario: c.usuario,
        contrasena: hash,
        rol: 'cobrador',
        ruta_asignada: c.ruta_asignada,
        activo: true
      }
    })
    console.log(`✅ Creado: ${c.nombre} - Ruta ${c.ruta_asignada}`)
  }

  await prisma.$disconnect()
}

main()
