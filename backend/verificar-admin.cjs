/**
 * verificar-admin.cjs
 * Verifica si existe el usuario administrador y lo crea/resetea si es necesario.
 * Ejecutar: node verificar-admin.cjs
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

// ── Configura aquí las credenciales del admin ──────────────
const USUARIO   = 'admin'
const CONTRASENA = 'Admin1234'   // cambia esto a la contraseña que quieras
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Verificando conexión a la base de datos...')

  try {
    const count = await prisma.usuario.count()
    console.log(`✓ Conexión OK — ${count} usuario(s) en la BD\n`)
  } catch (e) {
    console.error('❌ No se pudo conectar a la BD:', e.message)
    process.exit(1)
  }

  const todos = await prisma.usuario.findMany({
    select: { id_usuario: true, nombre: true, usuario: true, rol: true, activo: true }
  })

  if (todos.length === 0) {
    console.log('⚠️  No hay usuarios. Creando administrador...')
  } else {
    console.log('Usuarios existentes:')
    todos.forEach(u => console.log(`  [${u.id_usuario}] ${u.usuario} — ${u.rol} — activo: ${u.activo}`))
    console.log()
  }

  const existente = todos.find(u => u.rol === 'administrador')

  if (existente) {
    console.log(`✓ Administrador encontrado: "${existente.usuario}"`)
    console.log(`  Reseteando contraseña a: ${CONTRASENA}`)
    const hash = await bcrypt.hash(CONTRASENA, 10)
    await prisma.usuario.update({
      where: { id_usuario: existente.id_usuario },
      data: { contrasena: hash, activo: true }
    })
    console.log(`\n✅ Listo. Inicia sesión con:`)
    console.log(`   Usuario:    ${existente.usuario}`)
    console.log(`   Contraseña: ${CONTRASENA}`)
  } else {
    console.log('No existe administrador. Creando uno...')
    const hash = await bcrypt.hash(CONTRASENA, 10)
    await prisma.usuario.create({
      data: { nombre: 'Administrador', usuario: USUARIO, contrasena: hash, rol: 'administrador' }
    })
    console.log(`\n✅ Administrador creado:`)
    console.log(`   Usuario:    ${USUARIO}`)
    console.log(`   Contraseña: ${CONTRASENA}`)
  }
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
