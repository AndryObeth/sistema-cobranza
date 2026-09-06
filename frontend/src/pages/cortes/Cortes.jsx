import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api'
import Layout from '../../components/Layout'

const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'
const fmtFechaHora = f => f
  ? `${new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })} ${new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}`
  : '—'
// YYYY-MM-DD en horario de México, para precargar los inputs de fecha
const isoMexico = f => f ? new Date(f).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) : ''

// Ordena "98-C", "347-C", etc. por el número inicial, no alfabéticamente
// (alfabético pondría "100-C" antes que "98-C")
const ordenarPorNumeroCuenta = (detalle) => {
  return [...detalle].sort((a, b) => {
    const na = parseInt(a.numero_cuenta) || 0
    const nb = parseInt(b.numero_cuenta) || 0
    return na - nb
  })
}

// PDF de un corte (vía ventana de impresión) — reutilizable tanto para el
// periodo actual en pantalla como para cualquier corte ya cerrado del historial.
const exportarPdfCorte = ({ nombreCobrador, semanaInicio, semanaFin, totalCobrado, totalComisiones, cantidadPagos, detalle, totalDeposito = 0, totalEfectivo = null }) => {
  const efectivo = totalEfectivo ?? (totalCobrado - totalDeposito)
  const filas = ordenarPorNumeroCuenta(detalle).map(p => `
    <tr>
      <td>${p.cliente}</td>
      <td>${p.numero_cuenta || '—'}</td>
      <td class="right">${fmt(p.monto)}</td>
      <td>${p.metodo_pago === 'deposito' ? 'Deposito' : 'Efectivo'}</td>
      <td class="right">${fmt(p.saldo_nuevo)}</td>
      <td>${fmtFechaHora(p.fecha_pago)}</td>
      <td class="cap">${p.origen_pago}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Corte ${nombreCobrador}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color:#1f2937; }
  h1 { font-size: 18px; margin-bottom:2px; }
  .sub { color:#6b7280; font-size:12px; margin-bottom:16px; }
  .resumen { display:flex; gap:16px; margin-bottom:20px; }
  .card { border:1px solid #e5e7eb; border-radius:8px; padding:12px 16px; flex:1; }
  .card .label { font-size:11px; color:#6b7280; }
  .card .valor { font-size:20px; font-weight:bold; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { text-align:left; background:#f9fafb; padding:8px; border-bottom:1px solid #e5e7eb; text-transform:uppercase; font-size:10px; color:#6b7280; }
  td { padding:8px; border-bottom:1px solid #f3f4f6; }
  .right { text-align:right; }
  .cap { text-transform:capitalize; }
  tfoot td { font-weight:bold; border-top:2px solid #e5e7eb; }
  .btn-imprimir { margin-top:20px; padding:10px 20px; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; }
  @media print { .btn-imprimir { display:none; } }
</style>
</head>
<body>
  <h1>Corte de cobrador — ${nombreCobrador}</h1>
  <p class="sub">Periodo: ${fmtFecha(semanaInicio)} – ${fmtFecha(semanaFin)} · Novedades Cancún</p>
  <div class="resumen">
    <div class="card"><div class="label">Total cobrado</div><div class="valor">${fmt(totalCobrado)}</div>${totalDeposito > 0 ? `<div style="font-size:11px;color:#4f46e5;margin-top:2px;">Depósitos: ${fmt(totalDeposito)} · Efectivo: ${fmt(efectivo)}</div>` : ''}</div>
    <div class="card"><div class="label">Comisión (12%)${totalDeposito > 0 ? ' — incluye depósitos' : ''}</div><div class="valor" style="color:#16a34a">${fmt(totalComisiones)}</div></div>
    <div class="card"><div class="label">Cantidad de pagos</div><div class="valor" style="color:#2563eb">${cantidadPagos}</div></div>
  </div>
  <table>
    <thead><tr><th>Cliente</th><th>No. cuenta</th><th class="right">Monto</th><th>Método</th><th class="right">Saldo actual</th><th>Fecha y hora</th><th>Origen</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td>Total</td><td></td><td class="right">${fmt(totalCobrado)}</td><td>${totalDeposito > 0 ? 'Efvo ' + fmt(efectivo) : ''}</td><td></td><td colspan="2"></td></tr></tfoot>
  </table>
  <button class="btn-imprimir" onclick="window.print()">Imprimir / Guardar como PDF</button>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`

  const ventana = window.open('', '_blank', 'width=900,height=700')
  if (!ventana) { alert('El navegador bloqueó la ventana emergente. Habilítala para exportar el PDF.'); return }
  ventana.document.write(html)
  ventana.document.close()
}

// Texto plano para compartir el corte por RawBT (impresora térmica portátil).
// Resumen arriba + desglose por cuenta (no. cuenta / monto / saldo actual)
// en formato de tabla de 3 columnas, para que quepa en el rollo de 58mm.
const formatearTextoCorte = ({ nombreCobrador, semanaInicio, semanaFin, totalCobrado, totalComisiones, cantidadPagos, detalle, totalDeposito = 0, totalEfectivo = null }) => {
  const W = 32
  const sep = '='.repeat(W)
  const das = '-'.repeat(W)
  const money = (n) => `$${parseFloat(n || 0).toFixed(2)}`
  const center = (s) => { const p = Math.max(0, Math.floor((W - s.length) / 2)); return ' '.repeat(p) + s }
  const row = (l, r) => { const sp = Math.max(1, W - l.length - r.length); return l + ' '.repeat(sp) + r }
  const fechaCorta = (f) => f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', timeZone: 'America/Mexico_City' }) : ''
  const nombre = (nombreCobrador || '').substring(0, 20)
  const periodo = `${fechaCorta(semanaInicio)} - ${fechaCorta(semanaFin)}`

  // Cuenta(9) + Monto(10, derecha) + Saldo(13, derecha) = 32
  const COL1 = 9, COL2 = 10, COL3 = 13
  const fila3 = (c, m, s) => {
    const cCol = c.length > COL1 ? c.substring(0, COL1) : c.padEnd(COL1)
    const mCol = m.length > COL2 ? m.slice(-COL2) : m.padStart(COL2)
    const sCol = s.length > COL3 ? s.slice(-COL3) : s.padStart(COL3)
    return cCol + mCol + sCol
  }

  const lineas = [
    sep,
    center('NOVEDADES CANCUN'),
    center('Corte de Cobrador'),
    sep,
    row('Cobrador:', nombre),
    row('Periodo:', periodo),
    das,
    row('Total cobrado:', money(totalCobrado)),
    ...(totalDeposito > 0 ? [
      row('- Depositos:', money(totalDeposito)),
      row('= Efectivo:', money(totalEfectivo ?? (totalCobrado - totalDeposito))),
    ] : []),
    row('Comision (12%):', money(totalComisiones)),
    row('Cantidad de pagos:', String(cantidadPagos)),
    das,
    center('DESGLOSE'),
    das,
    fila3('Cuenta', 'Monto', 'Saldo'),
    das,
  ]

  ordenarPorNumeroCuenta(detalle).forEach(p => {
    lineas.push(fila3(p.numero_cuenta || '—', money(p.monto), money(p.saldo_nuevo)))
  })

  lineas.push(sep)
  return lineas.join('\n')
}

// ─── badge estado ────────────────────────────────
function BadgeEstado({ estado }) {
  const colores = {
    abierto:  'bg-yellow-100 text-yellow-800',
    cerrado:  'bg-blue-100 text-blue-800',
    revisado: 'bg-purple-100 text-purple-800',
    pagado:   'bg-green-100 text-green-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colores[estado] || 'bg-gray-100 text-gray-700'}`}>
      {estado}
    </span>
  )
}

// ─── Modal Cerrar Corte Cobrador ─────────────────
function ModalCerrarCorte({ cobradorId, semana, onCerrar, onClose }) {
  const [totalDepositado, setTotalDepositado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [cargando, setCargando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!totalDepositado) return
    setCargando(true)
    try {
      await api.post('/cortes/cobrador/cerrar', {
        id_cobrador: cobradorId,
        fecha_inicio: semana.semana_inicio,
        fecha_fin: semana.semana_fin,
        total_depositado: parseFloat(totalDepositado),
        observaciones
      })
      onCerrar()
    } catch (err) {
      alert('Error al cerrar corte: ' + (err.response?.data?.detalle || err.message))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Cerrar corte de cobrador</h2>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
          <p><span className="text-gray-500">Total cobrado:</span> <strong>{fmt(semana.total_cobrado)}</strong></p>
          {semana.total_deposito > 0 && (
            <>
              <p><span className="text-indigo-500">− Depósitos directos:</span> <strong className="text-indigo-700">{fmt(semana.total_deposito)}</strong> <span className="text-gray-400 text-xs">(no los trae el cobrador)</span></p>
              <p className="border-t pt-1"><span className="text-gray-700">= Efectivo a entregar:</span> <strong>{fmt(semana.total_efectivo ?? semana.total_cobrado)}</strong></p>
            </>
          )}
          <p><span className="text-gray-500">Comisión (incluye depósitos):</span> <strong className="text-green-700">{fmt(semana.total_comisiones)}</strong></p>
          <p><span className="text-gray-500">Pagos:</span> <strong>{semana.cantidad_pagos}</strong></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Total entregado / depositado por el cobrador *</label>
            <input
              type="number"
              step="0.01"
              value={totalDepositado}
              onChange={e => setTotalDepositado(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`${(semana.total_efectivo ?? semana.total_cobrado).toFixed(2)}`}
              required
            />
            <p className="text-xs text-gray-400 mt-0.5">Solo el efectivo que el cobrador entregó — los depósitos directos ya están en la empresa.</p>
            {totalDepositado && (() => {
              const efectivo = semana.total_efectivo ?? semana.total_cobrado
              const dif = efectivo - parseFloat(totalDepositado)
              return (
                <p className={`text-xs mt-1 font-medium ${Math.abs(dif) < 0.01 ? 'text-green-600' : dif > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  Diferencia (efectivo): {fmt(dif)} {Math.abs(dif) < 0.01 ? '✓ cuadra' : dif > 0 ? '— falta entregar' : '— entregó de más'}
                </p>
              )
            })()}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Opcional..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Cerrando…' : 'Cerrar corte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TAB COBRADOR ────────────────────────────────
function TabCobrador({ usuario }) {
  const [cobradores, setCobradores] = useState([])
  const [idCobrador, setIdCobrador] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [inputInicio, setInputInicio] = useState('')
  const [inputFin, setInputFin] = useState('')
  const [comprobanteVisto, setComprobanteVisto] = useState(null)

  const verComprobante = async (idPago) => {
    try {
      const res = await api.get(`/pagos/${idPago}/comprobante`, { responseType: 'blob', timeout: 15000 })
      setComprobanteVisto(URL.createObjectURL(res.data))
    } catch {
      alert('No se pudo cargar el comprobante.')
    }
  }
  const cerrarComprobanteVisto = () => {
    if (comprobanteVisto) URL.revokeObjectURL(comprobanteVisto)
    setComprobanteVisto(null)
  }

  const esCobrador = ['cobrador', 'supervisor_cobranza'].includes(usuario?.rol)

  useEffect(() => {
    if (esCobrador) {
      setIdCobrador(usuario.id)
    } else {
      api.get('/usuarios').then(r => {
        const cobs = r.data.filter(u => ['cobrador', 'supervisor_cobranza'].includes(u.rol) && u.activo)
        setCobradores(cobs)
        if (cobs.length > 0) setIdCobrador(cobs[0].id_usuario)
      }).catch(() => {})
    }
  }, [esCobrador, usuario])

  useEffect(() => {
    if (!idCobrador) return
    setCargando(true)
    const params = (fechaInicio && fechaFin) ? { fecha_inicio: fechaInicio, fecha_fin: fechaFin } : {}
    Promise.all([
      api.get(`/cortes/cobrador/resumen/${idCobrador}`, { params }),
      api.get(`/cortes/cobrador/historial/${idCobrador}`)
    ]).then(([r, h]) => {
      setResumen(r.data)
      setHistorial(h.data)
      setInputInicio(isoMexico(r.data.semana_inicio))
      setInputFin(isoMexico(r.data.semana_fin))
    }).catch(() => {}).finally(() => setCargando(false))
  }, [idCobrador, fechaInicio, fechaFin])

  const recargar = () => {
    setModalAbierto(false)
    if (!idCobrador) return
    const params = (fechaInicio && fechaFin) ? { fecha_inicio: fechaInicio, fecha_fin: fechaFin } : {}
    Promise.all([
      api.get(`/cortes/cobrador/resumen/${idCobrador}`, { params }),
      api.get(`/cortes/cobrador/historial/${idCobrador}`)
    ]).then(([r, h]) => {
      setResumen(r.data)
      setHistorial(h.data)
    }).catch(() => {})
  }

  const aplicarRango = () => {
    if (!inputInicio || !inputFin) return
    setFechaInicio(inputInicio)
    setFechaFin(inputFin)
  }

  const restablecerSemanaActual = () => {
    setFechaInicio('')
    setFechaFin('')
  }

  const exportarPDF = () => {
    if (!resumen) return
    const nombreCobrador = esCobrador
      ? usuario?.nombre
      : (cobradores.find(c => c.id_usuario === idCobrador)?.nombre || '')

    exportarPdfCorte({
      nombreCobrador,
      semanaInicio: resumen.semana_inicio,
      semanaFin: resumen.semana_fin,
      totalCobrado: resumen.total_cobrado,
      totalComisiones: resumen.total_comisiones,
      cantidadPagos: resumen.cantidad_pagos,
      detalle: resumen.detalle,
      totalDeposito: resumen.total_deposito || 0,
      totalEfectivo: resumen.total_efectivo,
    })
  }

  const descargarCorteHistorial = (corte) => {
    const nombreCobrador = esCobrador
      ? usuario?.nombre
      : (cobradores.find(c => c.id_usuario === idCobrador)?.nombre || corte.cobrador?.nombre || '')

    const detalle = corte.detalles.map(d => ({
      id_pago: d.id_pago,
      cliente: d.pago?.cliente?.nombre || '—',
      numero_cuenta: d.pago?.cuenta?.numero_cuenta || d.pago?.cuenta?.folio_cuenta || null,
      monto: parseFloat(d.monto_pago),
      saldo_nuevo: parseFloat(d.pago?.saldo_nuevo || 0),
      fecha_pago: d.pago?.fecha_pago,
      origen_pago: d.pago?.origen_pago || '—',
      metodo_pago: d.pago?.metodo_pago,
    }))
    const totalComisiones = corte.detalles.reduce((s, d) => s + parseFloat(d.comision_generada), 0)

    exportarPdfCorte({
      nombreCobrador,
      semanaInicio: corte.fecha_inicio,
      semanaFin: corte.fecha_fin,
      totalCobrado: corte.total_cobrado,
      totalComisiones,
      cantidadPagos: corte.detalles.length,
      detalle,
      totalDeposito: parseFloat(corte.total_deposito || 0),
      totalEfectivo: parseFloat(corte.total_deposito || 0) > 0 ? parseFloat(corte.total_cobrado) - parseFloat(corte.total_deposito) : null,
    })
  }

  const compartirCorte = async (datos) => {
    try {
      await navigator.share({ title: `Corte ${datos.nombreCobrador}`, text: formatearTextoCorte(datos) })
    } catch (e) {
      if (e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message)
    }
  }

  const compartirCorteActual = () => {
    if (!resumen) return
    const nombreCobrador = esCobrador
      ? usuario?.nombre
      : (cobradores.find(c => c.id_usuario === idCobrador)?.nombre || '')

    compartirCorte({
      nombreCobrador,
      semanaInicio: resumen.semana_inicio,
      semanaFin: resumen.semana_fin,
      totalCobrado: resumen.total_cobrado,
      totalComisiones: resumen.total_comisiones,
      cantidadPagos: resumen.cantidad_pagos,
      detalle: resumen.detalle,
      totalDeposito: resumen.total_deposito || 0,
      totalEfectivo: resumen.total_efectivo,
    })
  }

  const compartirCorteHistorialFn = (corte) => {
    const nombreCobrador = esCobrador
      ? usuario?.nombre
      : (cobradores.find(c => c.id_usuario === idCobrador)?.nombre || corte.cobrador?.nombre || '')

    const detalle = corte.detalles.map(d => ({
      id_pago: d.id_pago,
      cliente: d.pago?.cliente?.nombre || '—',
      numero_cuenta: d.pago?.cuenta?.numero_cuenta || d.pago?.cuenta?.folio_cuenta || null,
      monto: parseFloat(d.monto_pago),
      saldo_nuevo: parseFloat(d.pago?.saldo_nuevo || 0),
      fecha_pago: d.pago?.fecha_pago,
      origen_pago: d.pago?.origen_pago || '—',
    }))
    const totalComisiones = corte.detalles.reduce((s, d) => s + parseFloat(d.comision_generada), 0)

    compartirCorte({
      nombreCobrador,
      semanaInicio: corte.fecha_inicio,
      semanaFin: corte.fecha_fin,
      totalCobrado: corte.total_cobrado,
      totalComisiones,
      cantidadPagos: corte.detalles.length,
      totalDeposito: parseFloat(corte.total_deposito || 0),
      totalEfectivo: parseFloat(corte.total_deposito || 0) > 0 ? parseFloat(corte.total_cobrado) - parseFloat(corte.total_deposito) : null,
      detalle,
    })
  }

  return (
    <div className="space-y-6">
      {/* Selector de cobrador (solo admin) */}
      {!esCobrador && cobradores.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Cobrador:</label>
          <select
            value={idCobrador || ''}
            onChange={e => setIdCobrador(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {cobradores.map(c => (
              <option key={c.id_usuario} value={c.id_usuario}>{c.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* Selector de rango de fechas */}
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl p-4 shadow-sm border">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={inputInicio}
            onChange={e => setInputInicio(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={inputFin}
            onChange={e => setInputFin(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={aplicarRango}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Aplicar
        </button>
        {(fechaInicio && fechaFin) && (
          <button
            onClick={restablecerSemanaActual}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
          >
            Semana actual
          </button>
        )}
      </div>

      {cargando && <p className="text-gray-400 text-sm">Cargando…</p>}

      {resumen && !cargando && (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">Total cobrado</p>
              <p className="text-2xl font-bold text-gray-800">{fmt(resumen.total_cobrado)}</p>
              {resumen.total_deposito > 0 ? (
                <p className="text-xs text-indigo-600 mt-1">
                  💳 {fmt(resumen.total_deposito)} en depósito · efectivo {fmt(resumen.total_efectivo)}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  {fmtFecha(resumen.semana_inicio)} – {fmtFecha(resumen.semana_fin)}
                </p>
              )}
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">Comisión generada (12%)</p>
              <p className="text-2xl font-bold text-green-600">{fmt(resumen.total_comisiones)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">Cantidad de pagos</p>
              <p className="text-2xl font-bold text-blue-600">{resumen.cantidad_pagos}</p>
            </div>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">Pagos del periodo</h3>
              <div className="flex items-center gap-2">
                {resumen.cantidad_pagos > 0 && (
                  <button
                    onClick={exportarPDF}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                  >
                    📄 Exportar PDF
                  </button>
                )}
                {'share' in navigator && resumen.cantidad_pagos > 0 && (
                  <button
                    onClick={compartirCorteActual}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
                  >
                    📲 Compartir / RawBT
                  </button>
                )}
                {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && resumen.cantidad_pagos > 0 && (
                  <button
                    onClick={() => setModalAbierto(true)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    ✂️ Cerrar corte
                  </button>
                )}
              </div>
            </div>
            {resumen.detalle.length === 0 ? (
              <p className="p-6 text-sm text-gray-400 text-center">Sin pagos en este periodo</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Cliente</th>
                      <th className="text-left px-4 py-3">No. cuenta</th>
                      <th className="text-right px-4 py-3">Monto</th>
                      <th className="text-left px-4 py-3">Método</th>
                      <th className="text-right px-4 py-3">Saldo actual</th>
                      <th className="text-left px-4 py-3">Fecha y hora</th>
                      <th className="text-left px-4 py-3">Origen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ordenarPorNumeroCuenta(resumen.detalle).map(p => (
                      <tr key={p.id_pago} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{p.cliente}</td>
                        <td className="px-4 py-3 text-blue-600 font-mono text-xs">{p.numero_cuenta || '—'}</td>
                        <td className="px-4 py-3 text-right">{fmt(p.monto)}</td>
                        <td className="px-4 py-3 text-xs">
                          {p.metodo_pago === 'deposito' ? (
                            <span className="text-indigo-600 font-medium">
                              💳 Depósito
                              {p.tiene_comprobante && (
                                <button onClick={() => verComprobante(p.id_pago)} className="ml-1 text-blue-600 underline">ver</button>
                              )}
                            </span>
                          ) : <span className="text-gray-400">Efectivo</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(p.saldo_nuevo)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtFechaHora(p.fecha_pago)}</td>
                        <td className="px-4 py-3 capitalize text-gray-500">{p.origen_pago}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right">{fmt(resumen.total_cobrado)}</td>
                      <td className="px-4 py-3 text-xs text-indigo-600">
                        {resumen.total_deposito > 0 ? `💳 ${fmt(resumen.total_deposito)} · efvo ${fmt(resumen.total_efectivo)}` : ''}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Historial */}
          {historial.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border">
              <h3 className="font-semibold text-gray-800 p-4 border-b">Historial de cortes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Período</th>
                      <th className="text-right px-4 py-3">Total cobrado</th>
                      <th className="text-right px-4 py-3">Depósitos</th>
                      <th className="text-right px-4 py-3">Entregado</th>
                      <th className="text-right px-4 py-3">Dif. efectivo</th>
                      <th className="text-right px-4 py-3">Comisión</th>
                      <th className="text-left px-4 py-3">Estado</th>
                      <th className="text-left px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historial.map(c => (
                      <tr key={c.id_corte_cobrador} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">
                          {fmtFecha(c.fecha_inicio)} – {fmtFecha(c.fecha_fin)}
                        </td>
                        <td className="px-4 py-3 text-right">{fmt(c.total_cobrado)}</td>
                        <td className="px-4 py-3 text-right text-indigo-600">{parseFloat(c.total_deposito) > 0 ? fmt(c.total_deposito) : '—'}</td>
                        <td className="px-4 py-3 text-right">{fmt(c.total_depositado)}</td>
                        <td className={`px-4 py-3 text-right ${Math.abs(parseFloat(c.diferencia)) < 0.01 ? 'text-green-600' : parseFloat(c.diferencia) > 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {fmt(c.diferencia)}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600">{fmt(c.comision_total)}</td>
                        <td className="px-4 py-3"><BadgeEstado estado={c.estado_corte} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {c.detalles?.length > 0 && (
                              <button
                                onClick={() => descargarCorteHistorial(c)}
                                className="text-blue-600 hover:text-blue-800 text-xs whitespace-nowrap"
                              >
                                📄 Descargar
                              </button>
                            )}
                            {'share' in navigator && (
                              <button
                                onClick={() => compartirCorteHistorialFn(c)}
                                className="text-blue-600 hover:text-blue-800 text-xs whitespace-nowrap"
                              >
                                📲 RawBT
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modalAbierto && resumen && (
        <ModalCerrarCorte
          cobradorId={idCobrador}
          semana={resumen}
          onCerrar={recargar}
          onClose={() => setModalAbierto(false)}
        />
      )}

      {comprobanteVisto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4" onClick={cerrarComprobanteVisto}>
          <div className="max-w-2xl max-h-[90vh] flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img src={comprobanteVisto} alt="Comprobante de depósito" className="max-w-full max-h-[80vh] rounded-lg object-contain" />
            <button onClick={cerrarComprobanteVisto} className="bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-medium">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB VENDEDOR ────────────────────────────────
function TabVendedor() {
  const [pendientes, setPendientes] = useState([])
  const [historialPorVendedor, setHistorialPorVendedor] = useState({})
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(null) // id_vendedor que se está pagando

  const cargarPendientes = () => {
    setCargando(true)
    api.get('/cortes/vendedor/pendientes')
      .then(r => setPendientes(r.data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }

  useEffect(() => { cargarPendientes() }, [])

  const cargarHistorial = async (id_vendedor) => {
    try {
      const r = await api.get(`/cortes/vendedor/historial/${id_vendedor}`)
      setHistorialPorVendedor(prev => ({ ...prev, [id_vendedor]: r.data }))
    } catch {}
  }

  const pagarCorte = async (vendedor) => {
    if (!confirm(`¿Pagar ${fmt(vendedor.total_a_pagar)} a ${vendedor.nombre_vendedor}?`)) return
    setPagando(vendedor.id_vendedor)
    try {
      await api.post('/cortes/vendedor/pagar', {
        id_vendedor: vendedor.id_vendedor,
        tipo_corte: 'veinte',
        ids_recuperaciones: vendedor.recuperaciones.map(r => r.id_recuperacion)
      })
      cargarPendientes()
      cargarHistorial(vendedor.id_vendedor)
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detalle || err.message))
    } finally {
      setPagando(null)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-gray-700">Enganches regados pendientes de pago</h3>

      {cargando && <p className="text-gray-400 text-sm">Cargando…</p>}

      {!cargando && pendientes.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border shadow-sm">
          Sin enganches pendientes de corte
        </div>
      )}

      {pendientes.map(v => (
        <div key={v.id_vendedor} className="bg-white rounded-xl shadow-sm border">
          {/* Encabezado vendedor */}
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <p className="font-semibold text-gray-800">{v.nombre_vendedor}</p>
              <p className="text-sm text-gray-500">
                {v.cantidad_recuperaciones} recuperación{v.cantidad_recuperaciones !== 1 ? 'es' : ''} · Total: <strong className="text-green-600">{fmt(v.total_a_pagar)}</strong>
              </p>
              {/* Jefes de grupo únicos involucrados en estas recuperaciones */}
              {(() => {
                const jefes = [...new Set(v.recuperaciones.map(r => r.jefe_camioneta).filter(Boolean))]
                return jefes.length > 0 ? (
                  <p className="text-xs text-gray-400 mt-0.5">Jefe(s): {jefes.join(', ')}</p>
                ) : null
              })()}
            </div>
            <button
              onClick={() => pagarCorte(v)}
              disabled={pagando === v.id_vendedor}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {pagando === v.id_vendedor ? 'Pagando…' : '✓ Pagar corte'}
            </button>
          </div>

          {/* Detalle recuperaciones */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Jefe de grupo</th>
                  <th className="text-right px-4 py-2">Recuperado</th>
                  <th className="text-right px-4 py-2">Com. cobrador</th>
                  <th className="text-right px-4 py-2">Neto vendedor</th>
                  <th className="text-left px-4 py-2">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {v.recuperaciones.map(r => (
                  <tr key={r.id_recuperacion} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{r.cliente}</td>
                    <td className="px-4 py-2 text-gray-500">{r.jefe_camioneta || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-right">{fmt(r.monto_recuperado)}</td>
                    <td className="px-4 py-2 text-right text-orange-600">-{fmt(r.comision_cobrador)}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-semibold">{fmt(r.monto_neto_vendedor)}</td>
                    <td className="px-4 py-2 text-gray-500">{fmtFecha(r.fecha_recuperacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Historial vendedores */}
      {Object.keys(historialPorVendedor).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border">
          <h3 className="font-semibold text-gray-800 p-4 border-b">Historial de cortes pagados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Vendedor</th>
                  <th className="text-left px-4 py-3">Fecha corte</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-right px-4 py-3">Total pagado</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.values(historialPorVendedor).flat().map(c => (
                  <tr key={c.id_corte_vendedor} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.vendedor?.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtFecha(c.fecha_corte)}</td>
                    <td className="px-4 py-3 capitalize">{c.tipo_corte}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">{fmt(c.total_pagado)}</td>
                    <td className="px-4 py-3"><BadgeEstado estado={c.estado_corte} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ────────────────────────────
export default function Cortes() {
  const { usuario } = useAuth()
  const [tab, setTab] = useState('cobrador')

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cortes y Comisiones</h1>
          <p className="text-gray-500 text-sm mt-1">Cierre semanal de cobrador y pago de comisiones a vendedores</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('cobrador')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition ${
              tab === 'cobrador' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            ✂️ Corte cobrador
          </button>
          <button
            onClick={() => setTab('vendedor')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition ${
              tab === 'vendedor' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            💰 Corte vendedor
          </button>
        </div>

        {tab === 'cobrador' && <TabCobrador usuario={usuario} />}
        {tab === 'vendedor' && <TabVendedor />}
      </div>
    </Layout>
  )
}
