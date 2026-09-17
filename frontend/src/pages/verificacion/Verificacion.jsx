import { useState, useEffect, useCallback } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { encodePlusCode, decodePlusCode, normalizePlusCode } from '../../utils/plusCode.js'
import { generarTicket, compartirTicket } from '../../utils/ticket.js'
import { comprimirImagen } from '../../utils/imagen.js'
import { encolarPago, encolarClienteCompleto, encolarUbicacion, encolarFrecuencia, encolarVerificacion } from '../../utils/offlineQueue.js'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'

const DIAS_COBRANZA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const LABEL_DIA = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' }
const LABEL_PLAN = { un_mes: '1 mes', dos_meses: '2 meses', tres_meses: '3 meses', largo_plazo: 'Largo plazo' }

export default function Verificacion() {
  const { usuario } = useAuth()
  // El supervisor es el primer filtro (primera visita); el segundo visto
  // bueno es exclusivo del administrador — ni el botón ni los datos de esa
  // cola se cargan para el supervisor.
  const esAdmin = usuario?.rol === 'administrador'

  const [tab, setTab] = useState('visita') // 'visita' | 'aprobacion'
  const [pendientesVisita, setPendientesVisita] = useState([])
  const [pendientesAprobacion, setPendientesAprobacion] = useState([])
  const [cargando, setCargando] = useState(true)
  const [seleccionada, setSeleccionada] = useState(null)
  const [filtroRuta, setFiltroRuta] = useState('')
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [rv, ra] = await Promise.all([
        api.get('/cuentas/verificacion/pendientes-visita', { timeout: 10000 }),
        esAdmin ? api.get('/cuentas/verificacion/pendientes-aprobacion', { timeout: 10000 }) : Promise.resolve({ data: [] }),
      ])
      setPendientesVisita(rv.data)
      setPendientesAprobacion(ra.data)
    } catch { /* la lista se queda como estaba, el usuario puede reintentar */ }
    setCargando(false)
  }, [esAdmin])

  useEffect(() => { cargar() }, [cargar])

  const rutasDisponibles = [...new Set([...pendientesVisita, ...pendientesAprobacion].map(c => c.cliente?.ruta).filter(Boolean))].sort()
  const filtrarPorRuta = lista => filtroRuta ? lista.filter(c => c.cliente?.ruta === filtroRuta) : lista
  const pendientesVisitaFiltrado = filtrarPorRuta(pendientesVisita)
  const pendientesAprobacionFiltrado = filtrarPorRuta(pendientesAprobacion)
  const listaActiva = tab === 'visita' ? pendientesVisitaFiltrado : pendientesAprobacionFiltrado

  // Se quita la cuenta de la lista local en vez de recargar del servidor:
  // recargar competía contra el caché offline (NetworkFirst) — con señal
  // lenta pero viva, el timeout del caché ganaba la carrera y volvía a
  // mostrar la versión vieja con la cuenta que se acababa de resolver
  // todavía ahí ("a veces no desaparece, o tarda"). Como la acción ya se
  // confirmó (o se encoló, si no había conexión), no hace falta preguntarle
  // al servidor qué pasó con ESA cuenta — ya lo sabemos.
  const alTerminar = (idCuenta, offline) => {
    setSeleccionada(null)
    setPendientesVisita(prev => prev.filter(c => c.id_cuenta !== idCuenta))
    setPendientesAprobacion(prev => prev.filter(c => c.id_cuenta !== idCuenta))
    if (offline) {
      setAviso('📴 Guardado sin conexión — se enviará solo cuando haya señal')
      setTimeout(() => setAviso(''), 5000)
    }
    window.dispatchEvent(new Event('verificacion-actualizada'))
  }

  return (
    <Layout>
      {aviso && (
        <div className="mb-4 bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-xl px-4 py-2.5">
          {aviso}
        </div>
      )}
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
            🔍 Por visitar{pendientesVisitaFiltrado.length > 0 && ` (${pendientesVisitaFiltrado.length})`}
          </button>
          {esAdmin && (
            <button onClick={() => setTab('aprobacion')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === 'aprobacion' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}>
              ✅ Por aprobar{pendientesAprobacionFiltrado.length > 0 && ` (${pendientesAprobacionFiltrado.length})`}
            </button>
          )}
          {rutasDisponibles.length > 0 && (
            <select value={filtroRuta} onChange={e => setFiltroRuta(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ml-auto">
              <option value="">Todas las rutas</option>
              {rutasDisponibles.map(r => <option key={r} value={r}>Ruta {r}</option>)}
            </select>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-500">Cargando...</div>
      ) : listaActiva.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-400">
          {tab === 'visita' ? '🎉 No hay ventas nuevas pendientes de visitar' : '🎉 No hay cuentas pendientes de aprobación final'}
          {filtroRuta && ` en la ruta ${filtroRuta}`}
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
        {tab === 'visita' ? `Vendida el ${fmtFecha(c.venta?.fecha_venta)}` : `Visitada el ${fmtFecha(c.fecha_primera_visita)} por ${c.supervisor_visita?.nombre || '—'}`}
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
  const { usuario } = useAuth()
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

  // Otras cuentas del cliente (alerta "cliente con varias cuentas") — el
  // supervisor solo puede REVISAR el historial para juzgar si está
  // sobre-endeudado, nunca cobrar ahí: esa acción vive solo para la cuenta
  // nueva que está verificando (arriba, "Cobrar primer pago").
  const [otrasCuentas, setOtrasCuentas] = useState(null) // null = no cargadas todavía
  const [cargandoOtras, setCargandoOtras] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(null) // id_cuenta con historial expandido
  const [historialPorCuenta, setHistorialPorCuenta] = useState({}) // { [id_cuenta]: pagos[] }
  const [cargandoHistorial, setCargandoHistorial] = useState(null) // id_cuenta en carga

  const cargarOtrasCuentas = async () => {
    if (otrasCuentas !== null) { setOtrasCuentas(null); return } // toggle: ocultar si ya estaban
    setCargandoOtras(true)
    try {
      const res = await api.get(`/cuentas/cliente/${c.id_cliente}`, { timeout: 10000 })
      setOtrasCuentas(res.data.filter(oc => oc.id_cuenta !== c.id_cuenta))
    } catch {
      setOtrasCuentas([])
    } finally {
      setCargandoOtras(false)
    }
  }

  const verHistorialSibling = async (id_cuenta) => {
    if (historialAbierto === id_cuenta) { setHistorialAbierto(null); return }
    setHistorialAbierto(id_cuenta)
    if (historialPorCuenta[id_cuenta]) return // ya se cargó antes
    setCargandoHistorial(id_cuenta)
    try {
      const res = await api.get(`/pagos/cuenta/${id_cuenta}`, { timeout: 10000 })
      setHistorialPorCuenta(prev => ({ ...prev, [id_cuenta]: res.data.pagos || [] }))
    } catch {
      setHistorialPorCuenta(prev => ({ ...prev, [id_cuenta]: [] }))
    } finally {
      setCargandoHistorial(null)
    }
  }

  const tieneUbicacion = !!(c.cliente?.latitud && c.cliente?.longitud) || !!c.cliente?.plus_code
  const faltaTelefono = !c.cliente?.telefono?.trim()
  const faltaReferencias = !c.cliente?.referencias?.trim()
  const faltaDia = !c.cliente?.dia_cobranza

  // Fecha primer cobro: si no se capturó al vender, se sugiere una a partir
  // de la fecha de venta + el intervalo típico de su frecuencia, para que el
  // supervisor solo tenga que confirmarla o ajustarla, no capturarla de cero.
  const INTERVALO_DIAS = { semanal: 7, quincenal: 15, mensual: 30, dos_meses: 60 }
  const sugerirFechaPrimerCobro = () => {
    const base = c.venta?.fecha_venta ? new Date(c.venta.fecha_venta) : new Date()
    base.setDate(base.getDate() + (INTERVALO_DIAS[c.frecuencia_pago] || 7))
    return base.toISOString().split('T')[0]
  }
  const [fechaPrimerCobro, setFechaPrimerCobro] = useState(
    c.fecha_primer_cobro ? c.fecha_primer_cobro.split('T')[0] : sugerirFechaPrimerCobro()
  )
  const fechaPrimerCobroEraSugerida = !c.fecha_primer_cobro
  const [guardandoFecha, setGuardandoFecha] = useState(false)
  const [fechaGuardada, setFechaGuardada] = useState(false)

  const guardarFechaPrimerCobro = async () => {
    setGuardandoFecha(true)
    setError('')
    const cambios = { fecha_primer_cobro: fechaPrimerCobro }
    const encolarYMostrar = () => {
      encolarFrecuencia({ id_cuenta: c.id_cuenta, cambios })
      setFechaGuardada(true)
      setTimeout(() => setFechaGuardada(false), 3000)
    }
    if (!navigator.onLine) { encolarYMostrar(); setGuardandoFecha(false); return }
    try {
      await api.put(`/pagos/cuenta/${c.id_cuenta}/frecuencia`, cambios, { timeout: 10000 })
      setFechaGuardada(true)
      setTimeout(() => setFechaGuardada(false), 3000)
    } catch (err) {
      if (err.response) setError(err.response.data?.error || 'Error al guardar la fecha de primer cobro')
      else encolarYMostrar()
    } finally {
      setGuardandoFecha(false)
    }
  }

  // Cobrar el primer abono en la propia visita — mismo endpoint y mismo
  // ticket que usa Cobranza.jsx, para que sea el comprobante de siempre.
  const [mostrarPago, setMostrarPago] = useState(false)
  const [formPago, setFormPago] = useState({ monto_pago: '', metodo_pago: 'efectivo', observaciones: '' })
  const [comprobanteDeposito, setComprobanteDeposito] = useState(null)
  const [procesandoComprobante, setProcesandoComprobante] = useState(false)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [errorPago, setErrorPago] = useState('')
  const [datosPagoRegistrado, setDatosPagoRegistrado] = useState(null)

  const registrarPago = async (e) => {
    e.preventDefault()
    const monto = parseFloat(formPago.monto_pago)
    if (!formPago.monto_pago || monto <= 0) { setErrorPago('Ingresa un monto válido'); return }
    if (monto > parseFloat(c.saldo_actual)) { setErrorPago(`El monto no puede ser mayor al saldo ($${fmt(c.saldo_actual)})`); return }
    setGuardandoPago(true)
    setErrorPago('')

    const payloadPago = {
      id_cuenta: c.id_cuenta,
      monto_pago: monto,
      tipo_pago: 'abono',
      origen_pago: 'domicilio',
      metodo_pago: formPago.metodo_pago,
      observaciones: formPago.observaciones,
      ...(formPago.metodo_pago === 'deposito' && comprobanteDeposito ? { comprobante_base64: comprobanteDeposito } : {}),
      // Misma clave en todos los reintentos (directo, cola offline, resincronización).
      idempotency_key: crypto.randomUUID(),
    }

    const datosTicketBase = {
      cliente_nombre: c.cliente?.nombre,
      numero_expediente: c.cliente?.numero_expediente,
      numero_cuenta: c.numero_cuenta,
      folio_cuenta: c.folio_cuenta,
      plan_actual: c.plan_actual,
      cobrador_nombre: usuario?.nombre || 'Supervisor',
      precio_original_total: c.venta?.precio_original_total,
      precio_final_total: c.venta?.precio_final_total,
      productos: (c.venta?.detalles || []).map(d => ({ nombre: d.producto, cantidad: d.cantidad })),
    }

    const encolarYMostrarProvisional = () => {
      encolarPago(payloadPago)
      const saldoAntes = parseFloat(c.saldo_actual)
      setDatosPagoRegistrado({
        ...datosTicketBase,
        id_pago: 'PENDIENTE',
        fecha_pago: new Date().toISOString(),
        monto_pago: monto,
        saldo_anterior: saldoAntes,
        saldo_nuevo: Math.max(0, saldoAntes - monto),
        tipo_pago: 'abono',
        origen_pago: 'domicilio',
        metodo_pago: formPago.metodo_pago,
        pendienteSync: true,
      })
      setFormPago({ monto_pago: '', metodo_pago: 'efectivo', observaciones: '' })
      setComprobanteDeposito(null)
      setMostrarPago(false)
    }

    if (!navigator.onLine) { encolarYMostrarProvisional(); setGuardandoPago(false); return }

    try {
      const res = await api.post('/pagos', payloadPago, { timeout: 10000 })
      const p = res.data.pago
      setDatosPagoRegistrado({
        ...datosTicketBase,
        id_pago: p.id_pago,
        fecha_pago: p.fecha_pago,
        monto_pago: p.monto_pago,
        saldo_anterior: p.saldo_anterior,
        saldo_nuevo: p.saldo_nuevo,
        tipo_pago: p.tipo_pago,
        origen_pago: p.origen_pago,
        metodo_pago: p.metodo_pago,
      })
      setFormPago({ monto_pago: '', metodo_pago: 'efectivo', observaciones: '' })
      setComprobanteDeposito(null)
      setMostrarPago(false)
    } catch (err) {
      if (err.response) {
        setErrorPago(err.response.data?.error || 'Error al registrar el pago')
      } else {
        // Sin respuesta del servidor (señal mala o se agotó el tiempo): se
        // encola en vez de perder el pago.
        encolarYMostrarProvisional()
      }
    } finally {
      setGuardandoPago(false)
    }
  }

  const procesarComprobante = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcesandoComprobante(true)
    try { setComprobanteDeposito(await comprimirImagen(file)) }
    catch { alert('No se pudo procesar la imagen') }
    finally { setProcesandoComprobante(false) }
  }

  const guardarCliente = async () => {
    setGuardandoCliente(true)
    setError('')
    const encolarYMostrar = () => {
      encolarClienteCompleto({ id_cliente: c.cliente.id_cliente, form })
      setClienteGuardado(true)
      setTimeout(() => setClienteGuardado(false), 3000)
    }
    if (!navigator.onLine) { encolarYMostrar(); setGuardandoCliente(false); return }
    try {
      await api.put(`/clientes/${c.cliente.id_cliente}`, form, { timeout: 10000 })
      setClienteGuardado(true)
      setTimeout(() => setClienteGuardado(false), 3000)
    } catch (err) {
      if (err.response) setError(err.response.data?.error || 'Error al guardar los datos del cliente')
      else encolarYMostrar()
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
    // Sin ref propia del cliente: son justo las coordenadas que se están
    // corrigiendo por estar mal (ver la misma nota en Cobranza/Mapa) —
    // normalizePlusCode usa el centro de Tuxtepec por defecto.
    const code = normalizePlusCode(plusCodeInput)
    if (!code) { alert('Plus Code no válido. Ej: 76QX2FXQ+QF'); return }
    const coords = decodePlusCode(code)
    if (!coords) { alert('No se pudo leer ese Plus Code. Revisa que esté completo y vuelve a intentar.'); return }
    setUbicPendiente({ lat: coords.lat, lng: coords.lng, plus_code: code })
    setPlusCodeInput(code)
  }

  const guardarUbicacion = async () => {
    if (!ubicPendiente) return
    setGuardandoUbic(true)
    setError('')
    const payloadUbic = { id_cliente: c.cliente.id_cliente, latitud: ubicPendiente.lat, longitud: ubicPendiente.lng, plus_code: ubicPendiente.plus_code }
    const encolarYMostrar = () => {
      encolarUbicacion(payloadUbic)
      setUbicGuardada(true)
      setTimeout(() => setUbicGuardada(false), 3000)
    }
    if (!navigator.onLine) { encolarYMostrar(); setGuardandoUbic(false); return }
    try {
      await api.put(`/clientes/${c.cliente.id_cliente}/coordenadas`, ubicPendiente, { timeout: 10000 })
      setUbicGuardada(true)
      setTimeout(() => setUbicGuardada(false), 3000)
    } catch (err) {
      if (err.response) setError(err.response.data?.error || 'Error al guardar la ubicación')
      else encolarYMostrar()
    } finally {
      setGuardandoUbic(false)
    }
  }

  const accion = tab === 'visita' ? 'visitar' : 'aprobar-final'
  const endpoint = `/cuentas/${c.id_cuenta}/verificacion/${accion}`

  const enviar = async (aprobar) => {
    if (!aprobar && !motivoRechazo.trim()) { setError('Escribe el motivo del rechazo'); return }
    setGuardando(true)
    setError('')
    const notasFinales = aprobar ? notas : motivoRechazo
    const encolarYSalir = () => {
      encolarVerificacion({ id_cuenta: c.id_cuenta, accion, aprobar, notas: notasFinales })
      onListo(c.id_cuenta, true)
    }
    if (!navigator.onLine) { encolarYSalir(); return }
    try {
      await api.post(endpoint, { aprobar, notas: notasFinales }, { timeout: 10000 })
      onListo(c.id_cuenta)
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.error || 'Error al guardar')
        setGuardando(false)
      } else {
        encolarYSalir()
      }
    }
  }

  const regresarAlSupervisor = async () => {
    setGuardando(true)
    setError('')
    const encolarYSalir = () => {
      encolarVerificacion({ id_cuenta: c.id_cuenta, accion: 'regresar' })
      onListo(c.id_cuenta, true)
    }
    if (!navigator.onLine) { encolarYSalir(); return }
    try {
      await api.post(`/cuentas/${c.id_cuenta}/verificacion/regresar`, {}, { timeout: 10000 })
      onListo(c.id_cuenta)
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.error || 'Error al regresar la cuenta')
        setGuardando(false)
      } else {
        encolarYSalir()
      }
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
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p>⚠️ Este cliente ya tiene <strong>{a.otras_cuentas_activas}</strong> cuenta{a.otras_cuentas_activas > 1 ? 's' : ''} activa{a.otras_cuentas_activas > 1 ? 's' : ''} más — revisar si no está sobre-endeudado.</p>
                    <button type="button" onClick={cargarOtrasCuentas} disabled={cargandoOtras}
                      className="shrink-0 text-xs font-semibold text-amber-900 underline disabled:opacity-50">
                      {cargandoOtras ? 'Cargando...' : otrasCuentas !== null ? 'Ocultar' : 'Ver historial'}
                    </button>
                  </div>
                  {otrasCuentas !== null && (
                    <div className="space-y-1.5 pt-1">
                      {otrasCuentas.map(oc => (
                        <div key={oc.id_cuenta} className="bg-white rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-blue-600">{oc.numero_cuenta || oc.folio_cuenta}</span>
                            <span className="text-gray-600">{oc.estado_cuenta}</span>
                            <span className="font-semibold text-gray-700">{fmt(oc.saldo_actual)}</span>
                            <button type="button" onClick={() => verHistorialSibling(oc.id_cuenta)}
                              className="text-blue-600 hover:underline shrink-0">
                              {historialAbierto === oc.id_cuenta ? 'Ocultar' : 'Ver pagos'}
                            </button>
                          </div>
                          {historialAbierto === oc.id_cuenta && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                              {cargandoHistorial === oc.id_cuenta ? (
                                <p className="text-gray-400">Cargando...</p>
                              ) : (historialPorCuenta[oc.id_cuenta] || []).length === 0 ? (
                                <p className="text-gray-400">Sin pagos registrados</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {historialPorCuenta[oc.id_cuenta].map(p => (
                                    <li key={p.id_pago} className="flex justify-between text-gray-600">
                                      <span>{fmtFecha(p.fecha_pago)}</span>
                                      <span>{fmt(p.monto_pago)}</span>
                                      <span className="text-gray-400">saldo {fmt(p.saldo_nuevo)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
                <p><strong>Vendida el:</strong> {fmtFecha(c.venta?.fecha_venta)}</p>
                <p><strong>Plan:</strong> {LABEL_PLAN[c.plan_actual] || c.plan_actual}</p>
                <p><strong>Precio:</strong> {fmt(c.precio_plan_actual)}</p>
                <p><strong>Enganche recibido:</strong> {fmt(c.abono_inicial)}</p>
                <p><strong>Saldo actual:</strong> {fmt(c.saldo_actual)}</p>
                <p><strong>Frecuencia:</strong> {(c.frecuencia_pago || 'semanal').replace(/_/g, ' ')}</p>
                <p><strong>Abono por periodo:</strong> {fmt(a.abono_actual)}</p>
              </div>
            </div>
            <div className="flex items-end gap-2 mt-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Fecha primer cobro {fechaPrimerCobroEraSugerida && <span className="text-amber-500">(sugerida, confirma o ajusta)</span>}
                </label>
                <input type="date" value={fechaPrimerCobro} onChange={e => setFechaPrimerCobro(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="button" onClick={guardarFechaPrimerCobro} disabled={guardandoFecha}
                className="text-xs px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium disabled:opacity-50">
                {guardandoFecha ? 'Guardando...' : '💾 Guardar'}
              </button>
              {fechaGuardada && <span className="text-xs text-green-600 self-center">✓</span>}
            </div>
          </div>

          {/* Cobrar el primer abono en la propia visita */}
          <div>
            {datosPagoRegistrado ? (
              <div className="bg-green-50 border border-green-300 rounded-xl p-3 space-y-2">
                <p className="text-sm text-green-800 font-medium">
                  ✅ Pago de {fmt(datosPagoRegistrado.monto_pago)} registrado — saldo restante {fmt(datosPagoRegistrado.saldo_nuevo)}
                </p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => generarTicket(datosPagoRegistrado).catch(() => alert('El navegador bloqueó la ventana emergente. Habilítala para ver el comprobante.'))}
                    className="flex-1 text-xs px-3 py-2 bg-white border border-green-300 hover:bg-green-100 text-green-800 rounded-lg font-medium">
                    🖨️ Ver comprobante
                  </button>
                  {'share' in navigator && (
                    <button type="button" onClick={() => compartirTicket(datosPagoRegistrado)}
                      className="flex-1 text-xs px-3 py-2 bg-white border border-green-300 hover:bg-green-100 text-green-800 rounded-lg font-medium">
                      📲 Compartir
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => setDatosPagoRegistrado(null)} className="text-xs text-gray-500 hover:text-gray-700">
                  + Registrar otro pago
                </button>
              </div>
            ) : !mostrarPago ? (
              <button type="button" onClick={() => setMostrarPago(true)}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition border bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
                💵 Cobrar primer pago
              </button>
            ) : (
              <form onSubmit={registrarPago} className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-800">💵 Cobrar primer pago</p>
                <div>
                  <input type="number" step="0.01" min="0.01" max={c.saldo_actual} required
                    value={formPago.monto_pago}
                    onChange={e => setFormPago({ ...formPago, monto_pago: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <select value={formPago.metodo_pago}
                  onChange={e => { const m = e.target.value; setFormPago({ ...formPago, metodo_pago: m }); if (m !== 'deposito') setComprobanteDeposito(null) }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="efectivo">Efectivo</option>
                  <option value="deposito">Depósito</option>
                </select>
                {formPago.metodo_pago === 'deposito' && (
                  <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-2 space-y-2">
                    {comprobanteDeposito ? (
                      <div className="flex items-center gap-3">
                        <img src={comprobanteDeposito} alt="Comprobante" className="w-16 h-16 object-cover rounded-lg border border-indigo-200" />
                        <button type="button" onClick={() => setComprobanteDeposito(null)} className="text-xs text-red-600 hover:text-red-800 font-medium">Quitar foto</button>
                      </div>
                    ) : (
                      <div className={`grid grid-cols-2 gap-2 ${procesandoComprobante ? 'opacity-50 pointer-events-none' : ''}`}>
                        <label className="flex items-center justify-center gap-1.5 bg-white border border-indigo-300 rounded-lg px-3 py-2 text-xs font-medium text-indigo-700 cursor-pointer hover:bg-indigo-100 transition">
                          {procesandoComprobante ? 'Procesando…' : '📷 Tomar foto'}
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={procesarComprobante} />
                        </label>
                        <label className="flex items-center justify-center gap-1.5 bg-white border border-indigo-300 rounded-lg px-3 py-2 text-xs font-medium text-indigo-700 cursor-pointer hover:bg-indigo-100 transition">
                          🖼️ De galería
                          <input type="file" accept="image/*" className="hidden" onChange={procesarComprobante} />
                        </label>
                      </div>
                    )}
                  </div>
                )}
                <input type="text" value={formPago.observaciones}
                  onChange={e => setFormPago({ ...formPago, observaciones: e.target.value })}
                  placeholder="Observaciones (opcional)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {errorPago && <p className="text-red-600 text-xs">{errorPago}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setMostrarPago(false); setErrorPago('') }} disabled={guardandoPago}
                    className="flex-1 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={guardandoPago}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    {guardandoPago ? 'Guardando...' : 'Registrar pago'}
                  </button>
                </div>
              </form>
            )}
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

        <div className="p-5 border-t sticky bottom-0 bg-white space-y-2">
          {!modoRechazo ? (
            <>
              {tab === 'aprobacion' && (
                <button onClick={regresarAlSupervisor} disabled={guardando}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  ↩ Regresar al supervisor
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => setModoRechazo(true)} disabled={guardando}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  🚫 Rechazar
                </button>
                <button onClick={() => enviar(true)} disabled={guardando}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                  {guardando ? 'Guardando...' : tab === 'visita' ? '✅ Aprobar y enviar' : '✅ Dar visto bueno'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setModoRechazo(false); setError('') }} disabled={guardando}
                className="flex-1 flex items-center justify-center px-4 py-2.5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition disabled:opacity-50">
                Volver
              </button>
              <button onClick={() => enviar(false)} disabled={guardando}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                {guardando ? 'Rechazando...' : '🚫 Confirmar rechazo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
