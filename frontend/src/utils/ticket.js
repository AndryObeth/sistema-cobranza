// Generación del comprobante de pago imprimible/compartible — usado por
// Cobranza.jsx (cobrador normal) y por Verificacion.jsx (supervisor cobrando
// el primer abono en la primera visita). Antes vivía duplicado dentro de
// Cobranza.jsx; se extrajo aquí para que ambas pantallas usen exactamente
// el mismo ticket.

export const TELEFONO_EMPRESA = '5646430474'
export const TELEFONO_EMPRESA_FMT = TELEFONO_EMPRESA.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')

// Cache de logo/fuentes a nivel de módulo — se comparte entre cualquier
// pantalla que use este archivo, no hace falta un ref por componente.
// Importante: esto se llama SIEMPRE desde el contexto de la app (nunca desde
// dentro del popup del ticket, que es about:blank y no pasa por el service
// worker) — así el fetch sí puede responder desde caché aunque no haya señal.
let recursosCache = null

export async function cargarRecursosTicket() {
  if (recursosCache) return recursosCache
  const origen = window.location.origin
  const fallback = {
    logo: `${origen}/logo.png`,
    f400: `${origen}/fonts/comic-neue-400.woff2`,
    f700: `${origen}/fonts/comic-neue-700.woff2`,
  }
  try {
    const [logo, f400, f700] = await Promise.all([
      fetch(fallback.logo).then(r => r.blob()),
      fetch(fallback.f400).then(r => r.blob()),
      fetch(fallback.f700).then(r => r.blob()),
    ])
    recursosCache = {
      logo: URL.createObjectURL(logo),
      f400: URL.createObjectURL(f400),
      f700: URL.createObjectURL(f700),
    }
  } catch {
    return fallback // sin señal y sin caché: se usan URLs directas (el ticket igual se genera)
  }
  return recursosCache
}

export function buildTicketHtml(datos, recursos) {
  const { logo: logoSrc, f400, f700 } = recursos || {}
  const {
    id_pago, fecha_pago, monto_pago, saldo_anterior, saldo_nuevo,
    tipo_pago, origen_pago, metodo_pago,
    cliente_nombre, numero_expediente, numero_cuenta, folio_cuenta, plan_actual,
    cobrador_nombre,
    precio_original_total, precio_final_total,
    productos,
    pendienteSync,
  } = datos

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const filasProductos = (productos || [])
    .filter(p => p?.nombre)
    .map(p => `<div class="row"><span>${esc(p.nombre)}</span><span>${p.cantidad > 1 ? '&times;' + p.cantidad : ''}</span></div>`)
    .join('')

  const precioOrig  = parseFloat(precio_original_total || 0)
  const precioFinal = parseFloat(precio_final_total || 0)
  const ahorro      = precioOrig > precioFinal ? precioOrig - precioFinal : 0

  const fmtMXN = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const fecha  = new Date(fecha_pago)
  const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' })
  const horaStr  = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
  const folioPago = `TICKET-${String(id_pago).padStart(6, '0')}`
  const origenStr = { domicilio: 'Domicilio', calle: 'Calle', oficina: 'Oficina' }[origen_pago] || origen_pago
  const tipoStr   = { abono: 'Abono', liquidacion: 'Liquidación', pago_extra: 'Pago extra', recuperacion_enganche: 'Rec. enganche' }[tipo_pago] || tipo_pago

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Comprobante ${folioPago}</title>
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
    .right   { text-align: right; }
    .bold    { font-weight: bold; }
    .row     { display: flex; justify-content: space-between; margin: 2px 0; font-size: 10px; }
    .sep-sol { border-top: 1px solid #000; margin: 4px 0; }
    .sep-das { border-top: 1px dashed #666; margin: 4px 0; }
    .titulo  { font-size: 10px; color: #444; margin-top: 2px; }
    .folio   { font-size: 9px; color: #555; margin-top: 3px; }
    .monto-principal { font-size: 22px; font-weight: bold; text-align: center; letter-spacing: 1px; margin: 5px 0 3px; }
    .monto-label { font-size: 9px; text-align: center; color: #555; }
    .liquidar-box { border: 1px dashed #000; padding: 3px 4px; margin: 4px 0; text-align: center; font-size: 10px; }
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
    <div class="titulo">Comprobante de Pago</div>
    <div class="folio">${folioPago}</div>
    <div class="folio">${fechaStr} &nbsp; ${horaStr}</div>
    ${pendienteSync ? '<div style="margin-top:2mm;border:1px dashed #92400e;background:#fef3c7;color:#92400e;font-size:9px;font-weight:bold;padding:2px;">⏳ PROVISIONAL — PENDIENTE DE SINCRONIZAR</div>' : ''}
  </div>

  <div class="sep-sol"></div>

  <div class="row"><span>Cliente:</span><span class="bold">${cliente_nombre}</span></div>
  <div class="row"><span>Expediente:</span><span>${numero_expediente}</span></div>
  ${numero_cuenta ? `<div class="row"><span>No. cuenta:</span><span class="bold">${numero_cuenta}</span></div>` : ''}
  <div class="row"><span>Folio sistema:</span><span>${folio_cuenta}</span></div>
  <div class="row"><span>Plan:</span><span>${plan_actual.replace(/_/g, ' ')}</span></div>

  ${filasProductos ? `
  <div class="sep-das"></div>
  <div class="monto-label" style="font-size:9px;">PRODUCTO(S)</div>
  ${filasProductos}
  ` : ''}

  ${precioOrig > 0 ? `
  <div class="sep-das"></div>
  <div class="row"><span>Precio original:</span><span style="text-decoration:line-through; color:#999">${fmtMXN(precioOrig)}</span></div>
  <div class="row"><span>Precio del plan:</span><span class="bold">${fmtMXN(precioFinal)}</span></div>
  ${ahorro > 0 ? `<div class="row" style="color:#16a34a; font-weight:bold"><span>Ahorro del cliente:</span><span>${fmtMXN(ahorro)}</span></div>` : ''}
  ` : ''}

  <div class="sep-das"></div>
  <div class="monto-label">MONTO ABONADO</div>
  <div class="monto-principal">${fmtMXN(monto_pago)}</div>
  <div class="row"><span>Tipo:</span><span>${tipoStr}</span></div>
  <div class="row"><span>Método:</span><span${metodo_pago === 'deposito' ? ' class="bold"' : ''}>${metodo_pago === 'deposito' ? '💳 Depósito' : 'Efectivo'}</span></div>
  <div class="sep-das"></div>
  <div class="row"><span>Saldo anterior:</span><span>${fmtMXN(saldo_anterior)}</span></div>
  <div class="row"><span>Saldo restante:</span><span class="bold">${fmtMXN(saldo_nuevo)}</span></div>

  <div class="liquidar-box">Para liquidar hoy: <strong>${fmtMXN(saldo_nuevo)}</strong></div>

  <div class="sep-das"></div>
  <div class="row"><span>Cobrador:</span><span>${cobrador_nombre}</span></div>
  <div class="row"><span>Origen:</span><span>${origenStr}</span></div>

  <div class="sep-sol"></div>
  <div class="pie">Conserve este comprobante</div>
  <div class="pie" style="margin-top:2px;">Dudas o aclaraciones: <a href="tel:${TELEFONO_EMPRESA}" style="color:#000;">${TELEFONO_EMPRESA_FMT}</a></div>
  <div class="pie" style="margin-top:3px; font-size:9px;">${folioPago}</div>

  <button class="btn-imprimir" onclick="window.print()">Imprimir</button>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
}

export function formatearTextoTicket(datos) {
  const W = 32
  const sep = '================================'
  const das = '--------------------------------'
  const fmt = (n) => `$${parseFloat(n || 0).toFixed(2)}`
  const fecha = new Date(datos.fecha_pago)
  const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' })
  const horaStr  = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
  const folio    = `TICKET-${String(datos.id_pago).padStart(6, '0')}`
  const center   = (s) => { const p = Math.max(0, Math.floor((W - s.length) / 2)); return ' '.repeat(p) + s }
  const row      = (l, r) => { const sp = Math.max(1, W - l.length - r.length); return l + ' '.repeat(sp) + r }
  const nombre   = (datos.cliente_nombre || '').substring(0, 20)
  const tipoStr  = { abono: 'Abono', liquidacion: 'Liquidacion', pago_extra: 'Pago extra', recuperacion_enganche: 'Rec. enganche' }[datos.tipo_pago] || datos.tipo_pago || ''
  const wrap     = (s) => (s.match(/.{1,32}/g) || [s]) // parte lineas > 32 chars
  const lineasProd = (datos.productos || [])
    .filter(p => p?.nombre)
    .flatMap(p => wrap(`${p.cantidad > 1 ? p.cantidad + 'x ' : ''}${p.nombre}`))

  return [
    sep,
    center('NOVEDADES CANCUN'),
    center('Comprobante de Pago'),
    center(folio),
    center(`${fechaStr}  ${horaStr}`),
    ...(datos.pendienteSync ? [center('*** PROVISIONAL, PENDIENTE ***'), center('DE SINCRONIZAR')] : []),
    sep,
    row('Cliente:', nombre),
    row('Expediente:', datos.numero_expediente || ''),
    ...(datos.numero_cuenta ? [row('No. cuenta:', datos.numero_cuenta)] : []),
    row('Plan:', (datos.plan_actual || '').replace(/_/g, ' ')),
    ...(lineasProd.length ? [das, center('PRODUCTO(S)'), ...lineasProd] : []),
    das,
    center('MONTO ABONADO'),
    center(fmt(datos.monto_pago)),
    row('Tipo:', tipoStr),
    row('Metodo:', datos.metodo_pago === 'deposito' ? 'DEPOSITO' : 'Efectivo'),
    das,
    row('Saldo anterior:', fmt(datos.saldo_anterior)),
    row('Saldo restante:', fmt(datos.saldo_nuevo)),
    das,
    center(`Para liquidar: ${fmt(datos.saldo_nuevo)}`),
    das,
    row('Cobrador:', datos.cobrador_nombre || ''),
    sep,
    center('Conserve este comprobante'),
    center(`Dudas: ${TELEFONO_EMPRESA_FMT}`),
    '', '', '',
  ].join('\n')
}

// window.open debe ser síncrono dentro del gesto del usuario o el popup se
// bloquea — por eso se abre antes de esperar cargarRecursosTicket().
export async function generarTicket(datos) {
  const ventana = window.open('', '_blank', 'width=350,height=650')
  if (!ventana) throw new Error('Popup bloqueado')
  const recursos = await cargarRecursosTicket()
  ventana.document.write(buildTicketHtml(datos, recursos))
  ventana.document.close()
}

export async function compartirTicket(datos) {
  const folio = `TICKET-${String(datos.id_pago).padStart(6, '0')}`
  try {
    await navigator.share({ title: folio, text: formatearTextoTicket(datos) })
  } catch (e) {
    if (e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message)
  }
}
