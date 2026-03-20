const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('admin123', 10)
  const user = await prisma.usuario.create({
    data: {
      nombre: 'Administrador',
      usuario: 'admin',
      contrasena: hash,
      rol: 'administrador'
    }
  })
  console.log('Usuario creado:', user.usuario)
  await prisma.$disconnect()
}

main()