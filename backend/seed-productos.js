/**
 * seed-productos.js
 * Lee Lista_Maestra_NovedadesCancun.xlsx y hace upsert de productos en la BD.
 * Uso: node backend/seed-productos.js   (desde la raíz del proyecto)
 *      node seed-productos.js            (desde dentro de backend/)
 */

require('dotenv').config()
const path  = require('path')
const XLSX  = require('xlsx')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Ruta al Excel (funciona tanto desde raíz como desde backend/) ──────────
const EXCEL_PATH = path.resolve(__dirname, '..', 'Lista_Maestra_NovedadesCancun.xlsx')
const HOJA       = 'Lista_Maestra'

// ── Helpers ──────────────────────────────────────────────────────────────────
const esValorValido = (v) =>
  v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim().toUpperCase() !== 'NO APLICA'

const toDecimal = (v) => esValorValido(v) ? parseFloat(v) : null

const toBoolean = (v) => String(v).trim().toUpperCase() === 'SI'

const limpiarTexto = (v) =>
  v !== null && v !== undefined ? String(v).trim() : null

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('━'.repeat(55))
  console.log('  SEED PRODUCTOS — Novedades Cancún')
  console.log('━'.repeat(55))
  console.log(`\nLeyendo: ${EXCEL_PATH}`)

  const wb   = XLSX.readFile(EXCEL_PATH)
  const ws   = wb.Sheets[HOJA]
  if (!ws) throw new Error(`Hoja "${HOJA}" no encontrada en el archivo.`)

  const filas = XLSX.utils.sheet_to_json(ws, { defval: null })
  console.log(`Filas totales en hoja: ${filas.length}`)

  const activos = filas.filter(f => f.Estatus === 'Activo')
  console.log(`Filas con Estatus=Activo: ${activos.length}\n`)

  // Agrupar por categoría para mostrar progreso
  const porCategoria = activos.reduce((acc, f) => {
    const cat = f.Categoria || 'Sin categoría'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})

  let totalInsertados = 0
  let totalActualizados = 0
  let totalErrores = 0
  const errores = []

  for (const [categoria, productos] of Object.entries(porCategoria)) {
    console.log(`📦 ${categoria} (${productos.length} productos)`)
    let okCat = 0

    for (const fila of productos) {
      const codigo = limpiarTexto(fila.Codigo)
      if (!codigo) {
        console.log(`  ⚠ Fila sin código, se omite`)
        totalErrores++
        continue
      }

      try {
        const data = {
          categoria:           limpiarTexto(fila.Categoria),
          subcategoria:        limpiarTexto(fila.Subcategoria),
          material:            limpiarTexto(fila.Material),
          nombre_comercial:    limpiarTexto(fila.Nombre_Comercial),
          nombre_interno:      limpiarTexto(fila.Nombre_Interno),
          marca:               limpiarTexto(fila.Marca),
          precio_original:     toDecimal(fila.Precio_Credito),   // precio credicontado es la base
          precio_credito:      toDecimal(fila.Precio_Credito),
          aplica_2_meses:      toBoolean(fila.Aplica_2_meses),
          pago_semanal_2_meses:toDecimal(fila.Pago_Semanal_2m),
          precio_2_meses:      toDecimal(fila.Precio_2_meses),
          aplica_3_meses:      toBoolean(fila.Aplica_3_meses),
          pago_semanal_3_meses:toDecimal(fila.Pago_Semanal_3m),
          precio_3_meses:      toDecimal(fila.Precio_3_meses),
          abono_semanal_largo: toDecimal(fila.Abono_Semanal_Largo),
          estatus:             'activo',
          notas:               limpiarTexto(fila.Notas)
        }

        // precio_original es obligatorio en el schema
        if (data.precio_original === null) {
          throw new Error(`Precio_Credito vacío o inválido`)
        }
        if (!data.nombre_comercial) {
          throw new Error(`Nombre_Comercial vacío`)
        }

        const result = await prisma.producto.upsert({
          where:  { codigo_producto: codigo },
          create: { codigo_producto: codigo, ...data },
          update: { ...data }
        })

        okCat++
        // Distinguir insert vs update (Prisma no lo expone directamente,
        // pero podemos inferirlo por fecha_actualizacion vs created_at si existieran;
        // aquí simplemente contamos como insertados/actualizados en conjunto)
        totalInsertados++
        process.stdout.write(`  ✓ ${codigo.padEnd(22)} ${String(data.nombre_comercial).substring(0, 28)}\n`)

      } catch (err) {
        totalErrores++
        const msg = `  ✗ ${codigo} → ${err.message}`
        console.log(msg)
        errores.push({ codigo, error: err.message })
      }
    }

    console.log(`  └─ ${okCat}/${productos.length} OK\n`)
  }

  // ── Resumen final ──────────────────────────────────────────────────────────
  console.log('━'.repeat(55))
  console.log('  RESUMEN')
  console.log('━'.repeat(55))
  console.log(`  Procesados : ${activos.length}`)
  console.log(`  Insertados/actualizados: ${totalInsertados}`)
  console.log(`  Errores    : ${totalErrores}`)

  if (errores.length > 0) {
    console.log('\n  Detalle de errores:')
    errores.forEach(e => console.log(`    • ${e.codigo}: ${e.error}`))
  }

  console.log('━'.repeat(55))

  // Conteo final en BD
  const total = await prisma.producto.count()
  console.log(`  Total productos en BD ahora: ${total}`)
  console.log('━'.repeat(55))
}

main()
  .catch(e => { console.error('\nError fatal:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
