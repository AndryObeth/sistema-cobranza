import { useState, useEffect, useCallback } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { encodePlusCode, decodePlusCode, normalizePlusCode } from '../../utils/plusCode.js'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'
const fmtFechaHora = f => f ? new Date(f).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const DIAS_COBRANZA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const LABEL_DIA = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' }
const LABEL_PLAN = { un_mes: '1 mes', dos_meses: '2 meses', tres_meses: '3 meses', largo_plazo: 'Largo plazo' }

export default function Verificacion() {
  const [tab, setTab] = useState('visita') // 'visita' | 'aprobacion'
  const [pendientesVisita, setPendientesVisita] = useState([])
  const [pendientesAprobacion, setPendientesAprobacion] = useState([])
  const [cargando, setCargando] = useState(true)
  const [seleccionada, setSeleccionada] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rv, ra] = await Promise.all([
        api.get('/cuentas/verificacion/pendientes-visita', { timeout: 10000 }),
        api.get('/cuentas/verificacion/pendientes-aprobacion', { timeout: 10000 }),
      ])
      setPendientesVisita(rv.data)
      setPendientesAprobacion(ra.data)
    } catch { /* la lista se queda como estaba, el usuario puede reintentar */ }
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const listaActiva = tab === 'visita' ? pendientesVisita : pendientesAprobacion

  const alTerminar = () => {
    setSeleccionada(null)
    cargar()
    window.dispatchEvent(new Event('verificacion-actualizada'))
  }

  return (
    <Layout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Primera visita</h2>
        <p className="text-gray-500 text-sm mt-1">
          Revisión de ventas nuevas antes de pasarlas al cobrador — confirmar el trato, detectar irregularidades y completar datos.
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <button onClick={() => setTab('visita')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'visita' ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}>
            🔍 Por visitar{pendientesVisita.length > 0 && ` (${pendientesVisita.length})`}
          </button>
          <button onClick={() => setTab('aprobacion')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'aprobacion' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}>
            ✅ Por aprobar{pendientesAprobacion.length > 0 && ` (${pendientesAprobacion.length})`}
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-500">Cargando...</div>
      ) : listaActiva.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-400">
          {tab === 'visita' ? '🎉 No hay ventas nuevas pendientes de visitar' : '🎉 No hay cuentas pendientes de aprobación final'}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listaActiva.map(c => (
            <TarjetaCuenta key={c.id_cuenta} cuenta={c} tab={tab} onClick={() => setSeleccionada(c)} />
          ))}
        </div>
      )}

      {seleccionada && (
        <ModalDetalle cuenta={seleccionada} tab={tab} onClose={() => setSeleccionada(null)} onListo={alTerminar} />
      )}
    </Layout>
  )
}

function TarjetaCuenta({ cuenta: c, tab, onClick }) {
  const a = c.alertas || {}
  return (
    <button onClick={onClick} className="text-left bg-white rounded-2xl shadow p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-800 truncate">{c.cliente?.nombre}</p>
          <p className="text-xs text-gray-400">{c.numero_cuenta ? `Cta. ${c.numero_cuenta}` : c.folio_cuenta} · Ruta {c.cliente?.ruta || '—'}</p>
        </div>
        <p className="font-bold text-gray-800 shrink-0">{fmt(c.precio_plan_actual)}</p>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {[c.cliente?.colonia, c.cliente?.municipio].filter(Boolean).join(', ') || c.cliente?.direccion || 'Sin dirección'}
      </p>
      <p className="text-xs text-gray-500">Vendedor: {c.venta?.vendedor?.nombre || '—'}</p>
      <p className="text-xs text-gray-400">
        {tab === 'visita' ? `Vendida el ${fmtFecha(c.fecha_inicio)}` : `Visitada el ${fmtFecha(c.fecha_primera_visita)} por ${c.supervisor_visita?.nombre || '—'}`}
      </p>
      {(a.cliente_con_varias_cuentas || a.abono_bajo) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {a.cliente_con_varias_cuentas && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[11px] font-medium">
              ⚠️ {a.otras_cuentas_activas} cuenta{a.otras_cuentas_activas > 1 ? 's' : ''} más
            </span>
          )}
          {a.abono_bajo && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-medium">⚠️ Abono bajo</span>
          )}
        </div>
      )}
    </button>
  )
}

function ModalDetalle({ cuenta: c, tab, onClose, onListo }) {
  const a = c.alertas || {}
  const [notas, setNotas] = useState('')
  const [modoRechazo, setModoRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Datos del cliente — se editan completos porque PUT /clientes/:id espera el objeto entero
  const [form, setForm] = useState({
    nombre: c.cliente?.nombre || '',
    alias: c.cliente?.alias || '',
    telefono: c.cliente?.telefono || '',
    municipio: c.cliente?.municipio || '',
    colonia: c.cliente?.colonia || '',
    direccion: c.cliente?.direccion || '',
    referencias: c.cliente?.referencias || '',
    ruta: c.cliente?.ruta || '',
    estado_cliente: c.cliente?.estado_cliente || 'activo',
    nivel_riesgo: c.cliente?.nivel_riesgo || '',
    observaciones_generales: c.cliente?.observaciones_generales || '',
    dia_cobranza: c.cliente?.dia_cobranza || '',
  })
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const [clienteGuardado, setClienteGuardado] = useState(false)

  // Ubicación
  const [plusCodeInput, setPlusCodeInput] = useState(c.cliente?.plus_code || '')
  const [buscandoGPS, setBuscandoGPS] = useState(false)
  const [ubicPendiente, setUbicPendiente] = useState(null)
  const [guardandoUbic, setGuardandoUbic] = useState(false)
  const [ubicGuardada, setUbicGuardada] = useState(false)

  const tieneUbicacion = !!(c.cliente?.latitud && c.cliente?.longitud) || !!c.cliente?.plus_code
  const faltaTelefono = !c.cliente?.telefono?.trim()
  const faltaReferencias = !c.cliente?.referencias?.trim()
  const faltaDia = !c.cliente?.dia_cobranza

  const guardarCliente = async () => {
    setGuardandoCliente(true)
    setError('')
    try {
      await api.put(`/clientes/${c.cliente.id_cliente}`, form, { timeout: 10000 })
      setClienteGuardado(true)
      setTimeout(() => setClienteGuardado(false), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar los datos del cliente')
    } finally {
      setGuardandoCliente(false)
    }
  }

  const usarGPS = () => {
    if (!navigator.geolocation) { alert('Tu dispositivo no soporta GPS'); return }
    setBuscandoGPS(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const pc = encodePlusCode(coords.latitude, coords.longitude)
      setUbicPendiente({ lat: coords.latitude, lng: coords.longitude, plus_code: pc })
      setPlusCodeInput(pc)
      setBuscandoGPS(false)
    }, () => { alert('No se pudo obtener la ubicación'); setBuscandoGPS(false) }, { enableHighAccuracy: true, timeout: 10000 })
  }

  const verificarPlusCode = () => {
    if (!plusCodeInput.trim()) return
    const ref = c.cliente?.latitud && c.cliente?.longitud
      ? { lat: parseFloat(c.cliente.latitud), lng: parseFloat(c.cliente.longitud) }
      : null
    const code = normalizePlusCode(plusCodeInput, ref)
    if (!code) { alert('Plus Code no válido. Ej: 76QX2FXQ+QF'); return }
    const { lat, lng } = decodePlusCode(code)
    setUbicPendiente({ lat, lng, plus_code: code })
    setPlusCodeInput(code)
  }

  const guardarUbicacion = async () => {
    if (!ubicPendiente) return
    setGuardandoUbic(true)
    setError('')
    try {
      await api.put(`/clientes/${c.cliente.id_cliente}/coordenadas`, ubicPendiente, { timeout: 10000 })
      setUbicGuardada(true)
      setTimeout(() => setUbicGuardada(false), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar la ubicación')
    } finally {
      setGuardandoUbic(false)
    }
  }

  const endpoint = tab === 'visita' ? `/cuentas/${c.id_cuenta}/verificacion/visitar` : `/cuentas/${c.id_cuenta}/verificacion/aprobar-final`

  const enviar = async (aprobar) => {
    if (!aprobar && !motivoRechazo.trim()) { setError('Escribe el motivo del rechazo'); return }
    setGuardando(true)
    setError('')
    try {
      await api.post(endpoint, { aprobar, notas: aprobar ? notas : motivoRechazo }, { timeout: 10000 })
      onListo()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
      setGuardando(false)
    }
  }

  const regresarAlSupervisor = async () => {
    setGuardando(true)
    setError('')
    try {
      await api.post(`/cuentas/${c.id_cuenta}/verificacion/regresar`, {}, { timeout: 10000 })
      onListo()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al regresar la cuenta')
      setGuardando(false)
    }
  }

  const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const enlaceMaps = c.cliente?.plus_code
    ? `https://maps.google.com/?q=${encodeURIComponent(c.cliente.plus_code)}`
    : c.cliente?.latitud && c.cliente?.longitud
      ? `https://maps.google.com/?q=${c.cliente.latitud},${c.cliente.longitud}`
      : null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{c.cliente?.nombre}</h3>
            <p className="text-xs text-gray-400">{c.numero_cuenta ? `Cta. ${c.numero_cuenta}` : c.folio_cuenta} · Ruta {c.cliente?.ruta || '—'} · Vendedor: {c.venta?.vendedor?.nombre || '—'}</p>
            {enlaceMaps && (
              <a href={enlaceMaps} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">📍 Ir con Maps</a>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Alertas automáticas */}
          {(a.cliente_con_varias_cuentas || a.abono_bajo) && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-1 text-sm text-amber-800">
              {a.cliente_con_varias_cuentas && (
                <p>⚠️ Este cliente ya tiene <strong>{a.otras_cuentas_activas}</strong> cuenta{a.otras_cuentas_activas > 1 ? 's' : ''} activa{a.otras_cuentas_activas > 1 ? 's' : ''} más — revisar si no está sobre-endeudado.</p>
              )}
              {a.abono_bajo && (
                <p>⚠️ El abono capturado (<strong>{fmt(a.abono_actual)}</strong>) está por debajo del sugerido para este plan (<strong>{fmt(a.abono_sugerido)}</strong>).</p>
              )}
            </div>
          )}

          {/* Notas de la etapa anterior (solo en aprobación final) */}
          {tab === 'aprobacion' && c.notas_primera_visita && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
              <p className="font-semibold text-xs uppercase text-indigo-500 mb-1">Notas del supervisor ({c.supervisor_visita?.nombre})</p>
              <p>{c.notas_primera_visita}</p>
            </div>
          )}

          {/* Venta */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Detalle de la venta</p>
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <p><strong>Productos:</strong> {c.venta?.detalles?.map(d => `${d.producto} x${d.cantidad}`).join(', ') || '—'}</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <p><strong>Plan:</strong> {LABEL_PLAN[c.plan_actual] || c.plan_actual}</p>
                <p><strong>Precio:</strong> {fmt(c.precio_plan_actual)}</p>
                <p><strong>Enganche recibido:</strong> {fmt(c.abono_inicial)}</p>
                <p><strong>Saldo actual:</strong> {fmt(c.saldo_actual)}</p>
                <p><strong>Frecuencia:</strong> {(c.frecuencia_pago || 'semanal').replace(/_/g, ' ')}</p>
                <p><strong>Abono capturado:</strong> {fmt(a.abono_actual)}</p>
              </div>
            </div>
          </div>

          {/* Datos del cliente */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Datos del cliente
              {(faltaTelefono || faltaReferencias || faltaDia) && (
                <span className="ml-2 text-xs font-normal text-amber-600">— faltan datos por completar</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono {faltaTelefono && <span className="text-amber-500">(falta)</span>}</label>
                <input type="text" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Día de cobro {faltaDia && <span className="text-amber-500">(falta)</span>}</label>
                <select value={form.dia_cobranza} onChange={e => setForm({ ...form, dia_cobranza: e.target.value })} className={INPUT}>
                  <option value="">Sin asignar</option>
                  {DIAS_COBRANZA.map(d => <option key={d} value={d}>{LABEL_DIA[d]}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Referencias {faltaReferencias && <span className="text-amber-500">(falta)</span>}</label>
                <input type="text" value={form.referencias} onChange={e => setForm({ ...form, referencias: e.target.value })}
                  placeholder="Ej: casa azul, portón negro, junto a la tienda..." className={INPUT} />
              </div>
              <div className="col-span-2 text-xs text-gray-400">
                {form.colonia || '—'}, {form.municipio || '—'} — {form.direccion || 'sin dirección capturada'}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button type="button" onClick={guardarCliente} disabled={guardandoCliente}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium disabled:opacity-50">
                {guardandoCliente ? 'Guardando...' : '💾 Guardar datos del cliente'}
              </button>
              {clienteGuardado && <span className="text-xs text-green-600">✓ Guardado</span>}
            </div>
          </div>

          {/* Ubicación */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Ubicación
              {!tieneUbicacion && <span className="ml-2 text-xs font-normal text-amber-600">— sin ubicación</span>}
            </p>
            <div className="flex gap-2">
              <input type="text" value={plusCodeInput} onChange={e => { setPlusCodeInput(e.target.value); setUbicPendiente(null) }}
                placeholder="Plus Code (ej: 76QX2FXQ+QF)" className={`flex-1 ${INPUT}`} />
              <button type="button" onClick={verificarPlusCode} disabled={!plusCodeInput}
                className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40">
                Verificar
              </button>
            </div>
            <button type="button" onClick={usarGPS} disabled={buscandoGPS}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-40">
              📍 {buscandoGPS ? 'Obteniendo...' : 'Usar mi ubicación actual'}
            </button>
            {ubicPendiente && (
              <div className="flex items-center gap-3 mt-2">
                <button type="button" onClick={guardarUbicacion} disabled={guardandoUbic}
                  className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">
                  {guardandoUbic ? 'Guardando...' : '💾 Guardar ubicación'}
                </button>
                {ubicGuardada && <span className="text-xs text-green-600">✓ Guardada</span>}
              </div>
            )}
          </div>

          {/* Notas de esta etapa */}
          {!modoRechazo && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notas {tab === 'visita' ? '(confirmación del trato, observaciones)' : '(opcional)'}
              </label>
              <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej: Trato confirmado con el cliente, todo correcto." className={INPUT} />
            </div>
          )}

          {modoRechazo && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <label className="block text-sm font-medium text-red-700 mb-1">Motivo del rechazo *</label>
              <textarea rows={2} value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}
                placeholder="Ej: Mal trato del vendedor, el cliente no reconoce el trato, cliente sobre-endeudado..."
                className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <p className="text-xs text-red-600 mt-1">Al rechazar, la cuenta y la venta se cancelan — el crédito no procede.</p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-5 border-t flex flex-wrap gap-2 sticky bottom-0 bg-white">
          {!modoRechazo ? (
            <>
              <button onClick={() => setModoRechazo(true)} disabled={guardando}
                className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                🚫 Rechazar
              </button>
              {tab === 'aprobacion' && (
                <button onClick={regresarAlSupervisor} disabled={guardando}
                  className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  ↩ Regresar al supervisor
                </button>
              )}
              <button onClick={() => enviar(true)} disabled={guardando}
                className="ml-auto px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                {guardando ? 'Guardando...' : tab === 'visita' ? '✅ Aprobar y enviar a revisión final' : '✅ Dar visto bueno — activar cuenta'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setModoRechazo(false); setError('') }} disabled={guardando}
                className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                Volver
              </button>
              <button onClick={() => enviar(false)} disabled={guardando}
                className="ml-auto px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                {guardando ? 'Rechazando...' : '🚫 Confirmar rechazo y cancelar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
