// Ticket de "Corte de cobrador" para impresora térmica de 58mm, compartido
// como texto plano vía RawBT — igual que ya hacen utils/ticket.js
// (comprobante de pago) y formatearTextoCorte (Cortes.jsx).
//
// Nota de por qué NO es HTML + window.print(): se probó esa ruta primero,
// pero RawBT intercepta el diálogo de impresión del navegador como si fuera
// una impresora del sistema, rasteriza la página completa a una imagen y la
// reescala para "caber" — con una página larga eso la encoge y rota hasta
// quedar ilegible. Compartir texto plano evita ese problema por completo
// (RawBT lo imprime carácter por carácter, tal como los demás tickets de
// esta app) y de paso evita la marca de agua que RawBT gratis le pone a las
// imágenes.

const W = 32
const SEP = '='.repeat(W)
const DAS = '-'.repeat(W)

const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const center = (s) => { const p = Math.max(0, Math.floor((W - s.length) / 2)); return ' '.repeat(p) + s }
const row = (l, r) => { const sp = Math.max(1, W - l.length - r.length); return l + ' '.repeat(sp) + r }
const wrap = (s) => (s.match(new RegExp(`.{1,${W}}`, 'g')) || [s])

const fechaCorta = (f) => f
  ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' })
  : '—'

// Mismo criterio de orden que el resto de Cortes.jsx: numérico por
// numero_cuenta ("2-D" antes que "10-D"), no alfabético.
function ordenarPorNumeroCuenta(detalle) {
  return [...detalle].sort((a, b) => (parseInt(a.numero_cuenta) || 0) - (parseInt(b.numero_cuenta) || 0))
}

export function formatearTicketCorteCobrador({
  nombreCobrador, semanaInicio, semanaFin, totalCobrado, totalComisiones, cantidadPagos, detalle,
}) {
  const neto = (parseFloat(totalCobrado) || 0) - (parseFloat(totalComisiones) || 0)
  const ahora = new Date()

  const lineas = [
    center('NOVEDADES CANCÚN'),
    center('CORTE DE COBRADOR'),
    center(nombreCobrador || ''),
    center(`${fechaCorta(semanaInicio)} - ${fechaCorta(semanaFin)}`),
    SEP,
  ]

  ordenarPorNumeroCuenta(detalle || []).forEach(p => {
    lineas.push(...wrap(p.cliente || '—'))
    lineas.push(row(`Cta: ${p.numero_cuenta || '—'}`, money(p.monto)))
    lineas.push(DAS)
  })

  lineas.push(
    row('Total cobrado', money(totalCobrado)),
    row('Comision (12%)', money(totalComisiones)),
    row('Neto a entregar', money(neto)),
    SEP,
    center(`${cantidadPagos} cobro${cantidadPagos === 1 ? '' : 's'}`),
    center(`Impreso: ${fechaCorta(ahora)} ${ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}`),
    '',
    'Firma cobrador: __________',
    '', '', '',
  )

  return lineas.join('\n')
}

export async function compartirTicketCorteCobrador(datos) {
  const texto = formatearTicketCorteCobrador(datos)
  try {
    await navigator.share({ title: `Corte ${datos.nombreCobrador || ''}`, text: texto })
  } catch (e) {
    if (e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message)
  }
}
