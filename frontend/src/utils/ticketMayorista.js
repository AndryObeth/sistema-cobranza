// Comprobante de abono de Crédito Mayoristas — mismo patrón de ticket.js
// (popup de 58mm que se auto-imprime), pero con los datos propios de un
// movimiento de mayorista (no hay cuenta/plan/productos como en un pago
// normal de cliente).
import { cargarRecursosTicket, TELEFONO_EMPRESA, TELEFONO_EMPRESA_FMT } from './ticket.js'

function buildTicketMayoristaHtml(datos, recursos) {
  const { logo: logoSrc, f400, f700 } = recursos || {}
  const {
    id_movimiento, fecha, monto, saldo_anterior, saldo_nuevo,
    mayorista_nombre, atendido_por, observaciones,
  } = datos

  const fmtMXN = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const f = new Date(fecha)
  const fechaStr = f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' })
  const horaStr  = f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
  const folio = `MAY-${String(id_movimiento).padStart(6, '0')}`
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Comprobante ${folio}</title>
  <style>
    @font-face {
      font-family: 'Comic Neue';
      font-style: normal; font-weight: 400; font-display: swap;
      src: url('${f400 || window.location.origin + '/fonts/comic-neue-400.woff2'}') format('woff2');
    }
    @font-face {
      font-family: 'Comic Neue';
      font-style: normal; font-weight: 700; font-display: swap;
      src: url('${f700 || window.location.origin + '/fonts/comic-neue-700.woff2'}') format('woff2');
    }
    @page { size: 58mm auto; margin: 2mm 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Comic Neue', 'Comic Sans MS', 'Comic Sans', 'Chalkboard SE', cursive;
      font-size: 11px;
      width: 58mm;
      max-width: 58mm;
      margin: 0 auto;
      padding: 3mm 3mm;
      background: #fff;
      color: #000;
    }
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .row     { display: flex; justify-content: space-between; margin: 2px 0; font-size: 10px; }
    .sep-sol { border-top: 1px solid #000; margin: 4px 0; }
    .sep-das { border-top: 1px dashed #666; margin: 4px 0; }
    .titulo  { font-size: 10px; color: #444; margin-top: 2px; }
    .folio   { font-size: 9px; color: #555; margin-top: 3px; }
    .monto-principal { font-size: 22px; font-weight: bold; text-align: center; letter-spacing: 1px; margin: 5px 0 3px; }
    .monto-label { font-size: 9px; text-align: center; color: #555; }
    .pie { font-size: 9px; text-align: center; color: #444; }
    .btn-imprimir {
      display: block; width: 100%; padding: 8px; margin-top: 12px;
      background: #1d4ed8; color: #fff; border: none; border-radius: 4px;
      font-size: 13px; cursor: pointer; font-family: inherit;
    }
    @media print { .btn-imprimir { display: none; } body { padding: 0 2mm; } }
  </style>
</head>
<body>
  <div class="center">
    ${logoSrc ? `<img src="${logoSrc}" alt="Novedades Cancún" style="width:38mm;max-width:38mm;display:block;margin:0 auto 2mm;">` : '<div style="font-size:13px;font-weight:bold;letter-spacing:1px;">NOVEDADES CANCUN</div>'}
    <div class="titulo">Abono — Crédito Mayorista</div>
    <div class="folio">${folio}</div>
    <div class="folio">${fechaStr} &nbsp; ${horaStr}</div>
  </div>

  <div class="sep-sol"></div>

  <div class="row"><span>Mayorista:</span><span class="bold">${esc(mayorista_nombre)}</span></div>

  <div class="sep-das"></div>
  <div class="monto-label">MONTO ABONADO</div>
  <div class="monto-principal">${fmtMXN(monto)}</div>

  <div class="sep-das"></div>
  <div class="row"><span>Saldo anterior:</span><span>${fmtMXN(saldo_anterior)}</span></div>
  <div class="row"><span>Saldo restante:</span><span class="bold">${fmtMXN(saldo_nuevo)}</span></div>

  ${observaciones ? `
  <div class="sep-das"></div>
  <div class="row"><span>Nota:</span><span>${esc(observaciones)}</span></div>
  ` : ''}

  <div class="sep-das"></div>
  <div class="row"><span>Atendió:</span><span>${esc(atendido_por)}</span></div>

  <div class="sep-sol"></div>
  <div class="pie">Conserve este comprobante</div>
  <div class="pie" style="margin-top:2px;">Dudas o aclaraciones: <a href="tel:${TELEFONO_EMPRESA}" style="color:#000;">${TELEFONO_EMPRESA_FMT}</a></div>
  <div class="pie" style="margin-top:3px; font-size:9px;">${folio}</div>

  <button class="btn-imprimir" onclick="window.print()">Imprimir</button>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
}

// window.open debe ser síncrono dentro del gesto del usuario (el clic de
// "Ver comprobante") o el navegador bloquea el popup — por eso esta función
// se llama desde un botón aparte DESPUÉS de que el movimiento ya se guardó,
// nunca encadenada directo al await del POST (mismo criterio que el ticket
// de pago normal, ver CLAUDE.md "Fix ticket de liquidación").
export async function generarTicketMayorista(datos) {
  const ventana = window.open('', '_blank', 'width=350,height=650')
  if (!ventana) throw new Error('Popup bloqueado')
  const recursos = await cargarRecursosTicket()
  ventana.document.write(buildTicketMayoristaHtml(datos, recursos))
  ventana.document.close()
}

// Texto plano para compartir el comprobante por RawBT (impresora térmica
// portátil) — mismo formato de 32 caracteres que el resto de los tickets.
function formatearTextoTicketMayorista(datos) {
  const W = 32
  const sep = '='.repeat(W)
  const das = '-'.repeat(W)
  const money = (n) => `$${parseFloat(n || 0).toFixed(2)}`
  const center = (s) => { const p = Math.max(0, Math.floor((W - s.length) / 2)); return ' '.repeat(p) + s }
  const row = (l, r) => { const sp = Math.max(1, W - l.length - r.length); return l + ' '.repeat(sp) + r }
  const f = new Date(datos.fecha)
  const fechaStr = f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' })
  const horaStr  = f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
  const folio = `MAY-${String(datos.id_movimiento).padStart(6, '0')}`
  const nombre = (datos.mayorista_nombre || '').substring(0, 20)

  return [
    sep,
    center('NOVEDADES CANCUN'),
    center('Abono - Credito Mayorista'),
    center(folio),
    center(`${fechaStr}  ${horaStr}`),
    sep,
    row('Mayorista:', nombre),
    das,
    center('MONTO ABONADO'),
    center(money(datos.monto)),
    das,
    row('Saldo anterior:', money(datos.saldo_anterior)),
    row('Saldo restante:', money(datos.saldo_nuevo)),
    ...(datos.observaciones ? [das, row('Nota:', datos.observaciones)] : []),
    das,
    row('Atendio:', datos.atendido_por || ''),
    sep,
    center('Conserve este comprobante'),
    center(`Dudas: ${TELEFONO_EMPRESA_FMT}`),
    '', '', '',
  ].join('\n')
}

export async function compartirTicketMayorista(datos) {
  const folio = `MAY-${String(datos.id_movimiento).padStart(6, '0')}`
  try {
    await navigator.share({ title: folio, text: formatearTextoTicketMayorista(datos) })
  } catch (e) {
    if (e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message)
  }
}
