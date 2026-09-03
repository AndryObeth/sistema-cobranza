import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'
import { encolarPago, encolarVisita, encolarCambioDia, encolarUbicacion, getQueue } from '../../utils/offlineQueue.js'
import { encodePlusCode, decodePlusCode, normalizePlusCode } from '../../utils/plusCode.js'
import UbicacionesPanel from '../../components/UbicacionesPanel.jsx'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const CENTRO_TUXTEPEC = { lat: 18.0886, lng: -96.1342 }

function distanciaKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function rutaPorCercania(puntos, origen) {
  const restantes = [...puntos]
  const ruta = []
  let actual = origen
  while (restantes.length > 0) {
    let minDist = Infinity, idx = 0
    restantes.forEach((p, i) => { const d = distanciaKm(actual, p); if (d < minDist) { minDist = d; idx = i } })
    const sig = restantes.splice(idx, 1)[0]
    ruta.push(sig)
    actual = sig
  }
  return ruta
}

function SortableCardWrapper({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }
  return <div ref={setNodeRef} style={style} {...attributes}>{children(listeners)}</div>
}

const visitaColor = {
  promesa_pago:        'bg-green-100 text-green-700',
  no_localizado:       'bg-yellow-100 text-yellow-700',
  casa_cerrada:        'bg-gray-100 text-gray-600',
  se_nego:             'bg-red-100 text-red-700',
  visita:              'bg-blue-100 text-blue-700',
  observacion_general: 'bg-purple-100 text-purple-700',
}

const visitaLabel = {
  promesa_pago:        'Promesa de pago',
  no_localizado:       'No localizado',
  casa_cerrada:        'Casa cerrada',
  se_nego:             'Se negó',
  visita:              'Visita',
  observacion_general: 'Observación general',
}

const TIPOS_SIN_PAGO = [
  { value: 'no_localizado', label: 'No localizado' },
  { value: 'casa_cerrada',  label: 'Casa cerrada' },
  { value: 'se_nego',       label: 'Se negó' },
  { value: 'promesa_pago',  label: 'Promesa de pago' },
]

const FORM_PAGO_VACIO   = { monto_pago: '', tipo_pago: 'abono', origen_pago: 'domicilio', observaciones: '' }
const FORM_VISITA_VACIO = { tipo_seguimiento: 'no_localizado', comentario: '', fecha_programada: '' }

const TELEFONO_EMPRESA = '5646430474'
const TELEFONO_EMPRESA_FMT = TELEFONO_EMPRESA.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')

const LABEL_PLAN = {
  un_mes: '1 mes', dos_meses: '2 meses', tres_meses: '3 meses', largo_plazo: 'Largo plazo'
}

const SIGUIENTES_PLANES = {
  un_mes: ['dos_meses', 'tres_meses', 'largo_plazo'],
  dos_meses: ['tres_meses', 'largo_plazo'],
  tres_meses: ['largo_plazo'],
}

const DIAS_SEMANA_JS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] // índice = Date.getDay()
const DIAS_COBRANZA  = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const LABEL_DIA_COBRANZA = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo'
}
function diaDeHoy() { return DIAS_SEMANA_JS[new Date().getDay()] }
// Fecha local (no UTC): toISOString() se corre a las 6pm hora México por el offset -06:00
function fechaLocalHoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Cobranza() {
  const { usuario } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [soloVencidas, setSoloVencidas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [ordenar, setOrdenar] = useState('cumplimiento')
  // Día de cobranza seleccionado ('' = todos, elegido explícitamente; null = aún no configurado)
  const [filtroDia, setFiltroDia] = useState(() => {
    try {
      const raw = localStorage.getItem('cobranza_filtro_dia')
      return raw != null ? JSON.parse(raw) : null
    } catch { return null }
  })
  const claveOrdenDia = filtroDia || 'general'
  const [ordenManual, setOrdenManual] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`cobranza_orden_manual_${claveOrdenDia}`)) ?? [] } catch { return [] }
  })
  const [editandoPosicion, setEditandoPosicion] = useState(null) // id_cuenta en edición
  const [filtroEstado, setFiltroEstado] = useState(() => localStorage.getItem('cobranza_filtro_estado') ?? '')
  const [filtroRuta, setFiltroRuta] = useState(() => localStorage.getItem('cobranza_filtro_ruta') ?? '')
  const [filtroMunicipio, setFiltroMunicipio] = useState(() => localStorage.getItem('cobranza_filtro_municipio') ?? '')
  const [filtroColonia, setFiltroColonia] = useState(() => localStorage.getItem('cobranza_filtro_colonia') ?? '')
  // Modo cobranza — checklist (persistido en localStorage)
  const [modoCobranza, setModoCobranza] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cobranza_modo')) ?? false } catch { return false }
  })
  const [visitados, setVisitados] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cobranza_visitados')) ?? []) } catch { return new Set() }
  })
  const [soloPendientes, setSoloPendientes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cobranza_solo_pendientes')) ?? false } catch { return false }
  })
  const [ocultosRuta, setOcultosRuta] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cobranza_ocultos')) ?? []) } catch { return new Set() }
  })
  // Organizar tarjetero — asignar día a cada cuenta manualmente
  const [modoTarjetero, setModoTarjetero] = useState(false)
  const [soloSinDia, setSoloSinDia] = useState(false)

  // Ruta importada del Mapa — modo "parada actual / siguiente".
  // Vive aparte del orden del día; no se recalcula por GPS.
  const [modoRuta, setModoRuta] = useState(false)
  const [rutaImportada, setRutaImportada] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cobranza_orden_manual_ruta_importada')) ?? [] } catch { return [] }
  })
  const [rutaMeta, setRutaMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cobranza_ruta_importada_meta')) } catch { return null }
  })
  const [pasoRuta, setPasoRuta] = useState(0)
  const [paradasRuta, setParadasRuta] = useState({}) // { [id_cuenta]: 'pagado' | 'no_pago' }
  const [verRutaCompleta, setVerRutaCompleta] = useState(false)

  useEffect(() => { localStorage.setItem('cobranza_modo', JSON.stringify(modoCobranza)) }, [modoCobranza])
  useEffect(() => { localStorage.setItem('cobranza_visitados', JSON.stringify([...visitados])) }, [visitados])
  useEffect(() => { localStorage.setItem('cobranza_solo_pendientes', JSON.stringify(soloPendientes)) }, [soloPendientes])
  useEffect(() => { localStorage.setItem('cobranza_filtro_dia', JSON.stringify(filtroDia)) }, [filtroDia])
  useEffect(() => { localStorage.setItem('cobranza_ocultos', JSON.stringify([...ocultosRuta])) }, [ocultosRuta])
  useEffect(() => { localStorage.setItem('cobranza_filtro_estado', filtroEstado) }, [filtroEstado])
  useEffect(() => { localStorage.setItem('cobranza_filtro_ruta', filtroRuta) }, [filtroRuta])
  useEffect(() => { localStorage.setItem('cobranza_filtro_municipio', filtroMunicipio) }, [filtroMunicipio])
  useEffect(() => { localStorage.setItem('cobranza_filtro_colonia', filtroColonia) }, [filtroColonia])

  const toggleVisitado = (id) => {
    setVisitados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleOculto = (id) => {
    setOcultosRuta(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Progreso del modo ruta: se guarda ligado a la fecha en que se generó la
  // ruta, así una ruta nueva empieza limpia y una recarga de la app la conserva.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('cobranza_ruta_importada_progreso'))
      if (p && rutaMeta && p.generada === rutaMeta.generada) {
        setPasoRuta(p.paso ?? 0)
        setParadasRuta(p.paradas ?? {})
      }
    } catch {}
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!rutaMeta) return
    localStorage.setItem('cobranza_ruta_importada_progreso', JSON.stringify({
      generada: rutaMeta.generada, paso: pasoRuta, paradas: paradasRuta,
    }))
  }, [pasoRuta, paradasRuta, rutaMeta])

  const marcarParada = useCallback((id, estado) => {
    setParadasRuta(prev => ({ ...prev, [id]: estado }))
  }, [])

  const activarModoRuta = async () => {
    setModoCobranza(false)
    setModoTarjetero(false)
    setModoRuta(true)
    try {
      const res = await api.get('/usuarios/mi-orden', { params: { dia: 'ruta_importada' }, timeout: 10000 })
      if (Array.isArray(res.data.orden) && res.data.orden.length > 0) {
        setRutaImportada(res.data.orden)
        localStorage.setItem('cobranza_orden_manual_ruta_importada', JSON.stringify(res.data.orden))
      }
    } catch {}
  }

  const salirModoRuta = () => setModoRuta(false)

  const calcularRutaCobranza = (origen, cuentasData) => {
    const datos = cuentasData ?? cuentas
    const puntos = datos
      .map(c => {
        const u = c.cliente?.ubicaciones?.[0]
        const lat = u?.latitud ? parseFloat(u.latitud) : (c.cliente?.latitud ? parseFloat(c.cliente.latitud) : null)
        const lng = u?.longitud ? parseFloat(u.longitud) : (c.cliente?.longitud ? parseFloat(c.cliente.longitud) : null)
        if (!lat || !lng) return null
        return { id_cuenta: c.id_cuenta, lat, lng }
      })
      .filter(Boolean)
    if (puntos.length === 0) return
    const ordenados = rutaPorCercania(puntos, origen)
    const ordenadosIds = ordenados.map(p => p.id_cuenta)
    const sinUbicacion = datos
      .filter(c => !puntos.find(p => p.id_cuenta === c.id_cuenta))
      .map(c => c.id_cuenta)
    const nuevoOrden = [...ordenadosIds, ...sinUbicacion]
    setOrdenManual(nuevoOrden)
    setOrdenar('ruta')
    guardarOrdenRuta(nuevoOrden, claveOrdenDia)
  }

  const pedirGPSYCalcular = (cuentasData) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => calcularRutaCobranza({ lat: coords.latitude, lng: coords.longitude }, cuentasData),
        () => calcularRutaCobranza(CENTRO_TUXTEPEC, cuentasData),
        { enableHighAccuracy: true, timeout: 5000 }
      )
    } else {
      calcularRutaCobranza(CENTRO_TUXTEPEC, cuentasData)
    }
  }

  // Cuentas del día seleccionado (para enrutado por día); si no se usa la función, son todas
  const usaDiasCobranza    = cuentas.some(c => c.cliente?.dia_cobranza)
  const cuentasDelDiaFiltro = filtroDia ? cuentas.filter(c => c.cliente?.dia_cobranza === filtroDia) : cuentas

  // Al activar modo cobranza (o al cambiar de día): cargar el orden guardado para ese día.
  // Primero desde localStorage (funciona offline), luego se confirma/actualiza con el backend.
  useEffect(() => {
    if (!modoCobranza || cuentas.length === 0) return
    if (filtroDia == null && usaDiasCobranza) { setFiltroDia(diaDeHoy()); return }
    let local = []
    try { local = JSON.parse(localStorage.getItem(`cobranza_orden_manual_${claveOrdenDia}`)) ?? [] } catch {}
    if (local.length > 0) {
      setOrdenManual(local)
      setOrdenar('ruta')
    }
    cargarOrdenRuta(claveOrdenDia).then(tieneOrden => {
      if (!tieneOrden && local.length === 0) pedirGPSYCalcular(cuentasDelDiaFiltro)
    })
  }, [modoCobranza, filtroDia, cuentas.length]) // eslint-disable-line

  const activarModoCobranza = () => {
    setModoCobranza(true)
    setModoTarjetero(false)
    setModoRuta(false)
    setVisitados(new Set())
    setSoloPendientes(false)
  }

  const salirModoCobranza = () => {
    setModoCobranza(false)
    setVisitados(new Set())
    setSoloPendientes(false)
    setOcultosRuta(new Set())
    setOrdenar('cumplimiento')
  }

  const toggleModoTarjetero = () => {
    setModoTarjetero(prev => !prev)
    setModoCobranza(false)
    setModoRuta(false)
    setSoloSinDia(false)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  const handleDragEnd = ({ active, over }) => {
    try {
      if (!over || active.id === over.id) return
      const activeId = Number(active.id)
      const overId   = Number(over.id)
      setOrdenManual(prev => {
        const oldIdx = prev.indexOf(activeId)
        const newIdx = prev.indexOf(overId)
        if (oldIdx === -1 || newIdx === -1) return prev
        const next = arrayMove(prev, oldIdx, newIdx)
        guardarOrdenRuta(next, claveOrdenDia)
        return next
      })
    } catch (e) {
      console.error('Error en drag end:', e)
    }
  }

  const moverEnOrden = (id_cuenta, dir) => {
    setOrdenManual(prev => {
      const idx = prev.indexOf(id_cuenta)
      if (idx === -1) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = arrayMove(prev, idx, newIdx)
      guardarOrdenRuta(next, claveOrdenDia)
      return next
    })
  }

  const moverAPosicion = (id_cuenta, nuevaPos) => {
    const pos = parseInt(nuevaPos)
    if (isNaN(pos) || pos < 1) return
    setOrdenManual(prev => {
      const idx = prev.indexOf(id_cuenta)
      if (idx === -1) return prev
      const destino = Math.min(pos - 1, prev.length - 1)
      const next = arrayMove(prev, idx, destino)
      guardarOrdenRuta(next, claveOrdenDia)
      return next
    })
    setEditandoPosicion(null)
  }

  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null)
  const [datosLimitados, setDatosLimitados] = useState(false) // true = se usó el respaldo de la lista, no el detalle del servidor
  const [modalAbierto, setModalAbierto] = useState(false)

  // Flujo del modal
  const [noHuboPago, setNoHuboPago] = useState(false)
  const [registrarVisitaTambien, setRegistrarVisitaTambien] = useState(false)

  // Formularios
  const [formPago, setFormPago]     = useState(FORM_PAGO_VACIO)
  const [formVisita, setFormVisita] = useState(FORM_VISITA_VACIO)

  // Estado de envío
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [exito, setExito]         = useState('')

  // Datos del último pago registrado (para el ticket)
  const [datosPago, setDatosPago] = useState(null)

  // Edición de frecuencia de cobro
  const [editandoFrecuencia, setEditandoFrecuencia] = useState(false)
  const [formFrecuencia, setFormFrecuencia] = useState({ frecuencia_pago: 'semanal', fecha_primer_cobro: '', horario_preferido: '' })
  const [guardandoFrecuencia, setGuardandoFrecuencia] = useState(false)

  // Cambio de plan
  const [modalCambiarPlan, setModalCambiarPlan] = useState(false)
  const [nuevoPlanSugerido, setNuevoPlanSugerido] = useState(null)
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  const [previewCambio, setPreviewCambio] = useState(null) // { precio_anterior, precio_nuevo, saldo_anterior, saldo_nuevo }

  // Historiales
  const [historialPagos, setHistorialPagos]     = useState([])
  const [historialVisitas, setHistorialVisitas] = useState([])

  // Pago histórico (solo admin)
  const [pagoHistorico, setPagoHistorico]           = useState(false)
  const [fechaPagoHistorico, setFechaPagoHistorico] = useState('')

  // Fusión de cuentas (solo admin)
  const [modalFusion, setModalFusion]               = useState(false)
  const [cuentasCliente, setCuentasCliente]         = useState([])
  const [cuentasSecSel, setCuentasSecSel]           = useState([])
  const [guardandoFusion, setGuardandoFusion]       = useState(false)
  const [errorFusion, setErrorFusion]               = useState('')

  // Cancelación de cuenta (solo admin)
  const [modalCancelar, setModalCancelar]           = useState(false)
  const [motivoCancelacion, setMotivoCancelacion]   = useState('')
  const [notasCancelacion, setNotasCancelacion]     = useState('')
  const [guardandoCancelacion, setGuardandoCancelacion] = useState(false)
  const [errorCancelacion, setErrorCancelacion]     = useState('')

  // Corrección de ubicación desde campo
  const [panelUbicacion, setPanelUbicacion]   = useState(false)
  const [modoUbicacion, setModoUbicacion]     = useState(null) // 'opciones' | 'manual' | 'confirmar'
  const [ubicPendiente, setUbicPendiente]     = useState(null)
  const [ubicInput, setUbicInput]             = useState('')
  const [buscandoGPS, setBuscandoGPS]         = useState(false)
  const [guardandoUbic, setGuardandoUbic]     = useState(false)

  // Modal detalle
  const [modalDetalle, setModalDetalle]               = useState(false)
  const [cuentaDetalle, setCuentaDetalle]             = useState(null)
  const [datosLimitadosDetalle, setDatosLimitadosDetalle] = useState(false)
  const [historialPagosDetalle, setHistorialPagosDetalle]   = useState([])
  const [historialVisitasDetalle, setHistorialVisitasDetalle] = useState([])
  const [cargandoDetalle, setCargandoDetalle]         = useState(false)
  const [panelUbicDet, setPanelUbicDet]               = useState(false)
  const [modoUbicDet, setModoUbicDet]                 = useState(null)
  const [ubicPendDet, setUbicPendDet]                 = useState(null)
  const [ubicInputDet, setUbicInputDet]               = useState('')
  const [buscandoGPSDet, setBuscandoGPSDet]           = useState(false)
  const [guardandoUbicDet, setGuardandoUbicDet]       = useState(false)
  const [exitoUbicDet, setExitoUbicDet]               = useState('')
  const [mostrarDescuento, setMostrarDescuento]       = useState(false)
  const [montoDescuento, setMontoDescuento]           = useState('')
  const [motivoDescuento, setMotivoDescuento]         = useState('')
  const [guardandoDescuento, setGuardandoDescuento]   = useState(false)

  const saveTimerRef = useRef(null)

  const guardarOrdenRuta = useCallback((orden, dia) => {
    const clave = dia || 'general'
    localStorage.setItem(`cobranza_orden_manual_${clave}`, JSON.stringify(orden))
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      api.put('/usuarios/mi-orden', { orden, dia: clave }, { timeout: 10000 }).catch(() => {})
    }, 1200)
  }, [])

  const cargarOrdenRuta = async (dia) => {
    try {
      const res = await api.get('/usuarios/mi-orden', { params: { dia: dia || 'general' }, timeout: 10000 })
      const orden = res.data.orden
      if (Array.isArray(orden) && orden.length > 0) {
        setOrdenManual(orden)
        setOrdenar('ruta')
        localStorage.setItem(`cobranza_orden_manual_${dia || 'general'}`, JSON.stringify(orden))
        return true
      }
    } catch {}
    return false
  }

  useEffect(() => {
    cargarCuentas()
    if (new URLSearchParams(location.search).get('filtro') === 'vencidas') {
      setSoloVencidas(true)
    }
  }, [])

  // Si la carga inicial falló (sin señal), reintentar solo cuando vuelva la
  // conexión — si no, el cobrador se queda atorado en la pantalla de error
  // aunque recupere señal, hasta que recargue la app a mano.
  useEffect(() => {
    if (!errorCarga) return
    const handleOnline = () => cargarCuentas()
    window.addEventListener('online', handleOnline)
    const intervalo = setInterval(() => {
      if (navigator.onLine) cargarCuentas()
    }, 30000)
    return () => {
      window.removeEventListener('online', handleOnline)
      clearInterval(intervalo)
    }
  }, [errorCarga]) // eslint-disable-line

  const cargarCuentas = async () => {
    try {
      const res = await api.get('/pagos/todas-cuentas')
      setCuentas(res.data)
      setErrorCarga(false)
    } catch {
      console.error('Error al cargar cuentas')
      setErrorCarga(true)
    } finally {
      setCargando(false)
    }
  }

  // Precarga en segundo plano el detalle y las visitas de cada cuenta (aunque el
  // cobrador no la haya abierto) para que ya estén disponibles si se queda sin
  // señal a media ruta. Solo corre una vez por día y cuando hay conexión.
  useEffect(() => {
    if (!['cobrador', 'supervisor_cobranza'].includes(usuario?.rol)) return
    if (cuentas.length === 0) return
    if (!navigator.onLine) return
    const clave = `cobranza_precache_${fechaLocalHoy()}`
    if (localStorage.getItem(clave) === 'listo') return

    let cancelado = false
    const LOTE = 4
    const precargar = async () => {
      for (let i = 0; i < cuentas.length; i += LOTE) {
        if (cancelado || !navigator.onLine) return
        const lote = cuentas.slice(i, i + LOTE)
        await Promise.allSettled(lote.flatMap(c => [
          api.get(`/pagos/cuenta/${c.id_cuenta}`, { timeout: 10000 }),
          api.get(`/visitas/cuenta/${c.id_cuenta}`, { timeout: 10000 })
        ]))
        await new Promise(r => setTimeout(r, 150))
      }
      if (!cancelado) localStorage.setItem(clave, 'listo')
    }
    precargar()

    return () => { cancelado = true }
  }, [cuentas.length]) // eslint-disable-line

  // El cobrador puede reacomodar su propia ruta entre días, sin depender del admin.
  // Si no hay conexión (o la petición falla por red), se encola y se sincroniza después.
  const cambiarDiaCliente = async (cuenta, nuevoDia) => {
    const idCliente = cuenta.cliente?.id_cliente
    if (!idCliente) return
    const anterior = cuenta.cliente?.dia_cobranza || ''
    setCuentas(prev => prev.map(c =>
      c.id_cuenta === cuenta.id_cuenta
        ? { ...c, cliente: { ...c.cliente, dia_cobranza: nuevoDia || null } }
        : c
    ))
    const payload = { id_cliente: idCliente, dia_cobranza: nuevoDia || null }
    if (!navigator.onLine) { encolarCambioDia(payload); return }
    try {
      await api.put(`/clientes/${idCliente}/dia-cobranza`, { dia_cobranza: nuevoDia || null }, { timeout: 10000 })
    } catch (err) {
      if (err.response) {
        setCuentas(prev => prev.map(c =>
          c.id_cuenta === cuenta.id_cuenta
            ? { ...c, cliente: { ...c.cliente, dia_cobranza: anterior || null } }
            : c
        ))
        alert(err.response.data?.error || 'No se pudo cambiar el día')
      } else {
        // Falla de red aunque el navegador crea estar en línea: se encola igual
        encolarCambioDia(payload)
      }
    }
  }

  const abrirModal = async (cuenta) => {
    // Si /pagos/cuenta/:id no está en caché (sin señal y nunca se abrió antes),
    // usar los datos que ya tenemos en memoria de la lista (todas-cuentas) en
    // vez de bloquear el registro de pago — trae todo lo necesario (saldo,
    // cliente, precio del plan), solo falta el historial de pagos.
    let detalle
    let pagos = []
    try {
      const resCuenta = await api.get(`/pagos/cuenta/${cuenta.id_cuenta}`)
      detalle = resCuenta.data
      pagos = detalle.pagos || []
      setDatosLimitados(false)
    } catch {
      detalle = cuenta
      setDatosLimitados(true)
    }
    setCuentaSeleccionada(detalle)
    setHistorialPagos(pagos)
    try {
      const resVisitas = await api.get(`/visitas/cuenta/${cuenta.id_cuenta}`)
      setHistorialVisitas(resVisitas.data)
    } catch {
      setHistorialVisitas([])
    }
    setNoHuboPago(false)
    setRegistrarVisitaTambien(false)
    setFormPago(FORM_PAGO_VACIO)
    setFormVisita(FORM_VISITA_VACIO)
    setError('')
    setExito('')
    setEditandoFrecuencia(false)
    setFormFrecuencia({
      frecuencia_pago:    detalle.frecuencia_pago    || 'semanal',
      fecha_primer_cobro: detalle.fecha_primer_cobro ? detalle.fecha_primer_cobro.split('T')[0] : '',
      horario_preferido:  detalle.horario_preferido  || '',
    })
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setCuentaSeleccionada(null)
    setDatosLimitados(false)
    setNoHuboPago(false)
    setRegistrarVisitaTambien(false)
    setFormPago(FORM_PAGO_VACIO)
    setFormVisita(FORM_VISITA_VACIO)
    setError('')
    setExito('')
    setDatosPago(null)
    setHistorialPagos([])
    setHistorialVisitas([])
    setPagoHistorico(false)
    setFechaPagoHistorico('')
    setPanelUbicacion(false)
    setModoUbicacion(null)
    setUbicPendiente(null)
    setUbicInput('')
  }

  // Si se llegó aquí desde el Mapa ("Registrar pago" en una parada de la ruta
  // optimizada o en el globo de un cliente), abrir directo el modal de esa
  // cuenta en cuanto la lista esté cargada.
  // Se llegó desde el Mapa con "Usar en Cobranza": activar el modo ruta.
  const pidieronModoRuta = location.state?.modoRuta
  const yaActiveModoRuta = useRef(false)
  useEffect(() => {
    if (yaActiveModoRuta.current || !pidieronModoRuta) return
    yaActiveModoRuta.current = true
    // localStorage ya trae la ruta recién guardada por el Mapa; refrescar meta
    try { setRutaMeta(JSON.parse(localStorage.getItem('cobranza_ruta_importada_meta'))) } catch {}
    try {
      const ids = JSON.parse(localStorage.getItem('cobranza_orden_manual_ruta_importada')) ?? []
      if (ids.length > 0) setRutaImportada(ids)
    } catch {}
    setPasoRuta(0)
    setParadasRuta({})
    setModoCobranza(false)
    setModoTarjetero(false)
    setModoRuta(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [pidieronModoRuta]) // eslint-disable-line

  const abrirCuentaSolicitada = location.state?.abrirCuenta
  const yaAbriDesdeMapa = useRef(false)
  useEffect(() => {
    if (yaAbriDesdeMapa.current || !abrirCuentaSolicitada || cuentas.length === 0) return
    const cuenta = cuentas.find(c => c.id_cuenta === abrirCuentaSolicitada)
    yaAbriDesdeMapa.current = true
    // Limpiar el state para que no se reabra al refrescar o volver atrás
    navigate(location.pathname, { replace: true, state: {} })
    if (cuenta) abrirModal(cuenta)
  }, [abrirCuentaSolicitada, cuentas]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCorreccionUbicacion = () => {
    setPanelUbicacion(true)
    setModoUbicacion('opciones')
    setUbicPendiente(null)
    setUbicInput('')
  }

  const cerrarCorreccionUbicacion = () => {
    setPanelUbicacion(false)
    setModoUbicacion(null)
    setUbicPendiente(null)
    setUbicInput('')
  }

  const usarGPSUbicacion = () => {
    if (!navigator.geolocation) { alert('Tu dispositivo no soporta GPS'); return }
    setBuscandoGPS(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pc = encodePlusCode(coords.latitude, coords.longitude)
        setUbicPendiente({ lat: coords.latitude, lng: coords.longitude, plus_code: pc })
        setModoUbicacion('confirmar')
        setBuscandoGPS(false)
      },
      () => { alert('No se pudo obtener la ubicación GPS'); setBuscandoGPS(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const refCliente = (cli) => {
    const u = cli?.ubicaciones?.[0]
    const lat = parseFloat(u?.latitud ?? cli?.latitud)
    const lng = parseFloat(u?.longitud ?? cli?.longitud)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }

  const usarPlusCodeManualUbicacion = () => {
    const code = normalizePlusCode(ubicInput, refCliente(cuentaSeleccionada?.cliente))
    if (!code) { alert('Plus Code no válido. Ej: 76C97H6P+QF'); return }
    const { lat, lng } = decodePlusCode(code)
    setUbicPendiente({ lat, lng, plus_code: code })
    setModoUbicacion('confirmar')
  }

  const guardarUbicacionCliente = async () => {
    if (!ubicPendiente) return
    setGuardandoUbic(true)
    const idCliente = cuentaSeleccionada.cliente?.id_cliente
    const payload = { id_cliente: idCliente, latitud: ubicPendiente.lat, longitud: ubicPendiente.lng, plus_code: ubicPendiente.plus_code }
    const guardarLocalYSalir = () => {
      encolarUbicacion(payload)
      cerrarCorreccionUbicacion()
      setExito('📴 Ubicación guardada localmente — se enviará cuando haya conexión')
      setTimeout(() => setExito(''), 4000)
    }
    if (!navigator.onLine) { guardarLocalYSalir(); setGuardandoUbic(false); return }
    try {
      await api.put(`/clientes/${idCliente}/coordenadas`, {
        latitud:   ubicPendiente.lat,
        longitud:  ubicPendiente.lng,
        plus_code: ubicPendiente.plus_code,
      }, { timeout: 10000 })
      cerrarCorreccionUbicacion()
      setExito('Ubicación actualizada ✅')
      setTimeout(() => setExito(''), 4000)
    } catch (err) {
      if (err.response) alert(err.response.data?.error || 'Error al guardar la ubicación')
      else guardarLocalYSalir()
    } finally {
      setGuardandoUbic(false)
    }
  }

  const abrirDetalle = async (cuenta) => {
    setCargandoDetalle(true)
    setModalDetalle(true)
    try {
      const resCuenta = await api.get(`/pagos/cuenta/${cuenta.id_cuenta}`)
      setCuentaDetalle(resCuenta.data)
      setHistorialPagosDetalle(resCuenta.data.pagos || [])
      setDatosLimitadosDetalle(false)
      try {
        const resVisitas = await api.get(`/visitas/cuenta/${cuenta.id_cuenta}`)
        setHistorialVisitasDetalle(resVisitas.data)
      } catch {
        setHistorialVisitasDetalle([])
      }
    } catch {
      // Sin conexión y sin caché de esta cuenta: usar los datos que ya
      // tenemos en memoria de la lista en vez de dejar el modal vacío.
      setCuentaDetalle(cuenta)
      setHistorialPagosDetalle([])
      setHistorialVisitasDetalle([])
      setDatosLimitadosDetalle(true)
    } finally {
      setCargandoDetalle(false)
    }
  }

  const cerrarDetalle = () => {
    setModalDetalle(false)
    setCuentaDetalle(null)
    setDatosLimitadosDetalle(false)
    setHistorialPagosDetalle([])
    setHistorialVisitasDetalle([])
    setPanelUbicDet(false)
    setModoUbicDet(null)
    setUbicPendDet(null)
    setUbicInputDet('')
    setExitoUbicDet('')
    setMostrarDescuento(false)
    setMontoDescuento('')
    setMotivoDescuento('')
  }

  const aplicarDescuento = async () => {
    const monto = parseFloat(montoDescuento)
    if (!montoDescuento || monto <= 0) { alert('Ingresa un monto válido'); return }
    if (!motivoDescuento.trim()) { alert('Indica el motivo del descuento'); return }
    setGuardandoDescuento(true)
    try {
      await api.post(`/cuentas/${cuentaDetalle.id_cuenta}/descuento`, {
        monto,
        motivo: motivoDescuento.trim()
      }, { timeout: 10000 })
      const resCuenta = await api.get(`/pagos/cuenta/${cuentaDetalle.id_cuenta}`)
      setCuentaDetalle(resCuenta.data)
      setHistorialPagosDetalle(resCuenta.data.pagos || [])
      setMostrarDescuento(false)
      setMontoDescuento('')
      setMotivoDescuento('')
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo aplicar el descuento')
    } finally {
      setGuardandoDescuento(false)
    }
  }

  const usarGPSDetalle = () => {
    if (!navigator.geolocation) { alert('Tu dispositivo no soporta GPS'); return }
    setBuscandoGPSDet(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pc = encodePlusCode(coords.latitude, coords.longitude)
        setUbicPendDet({ lat: coords.latitude, lng: coords.longitude, plus_code: pc })
        setModoUbicDet('confirmar')
        setBuscandoGPSDet(false)
      },
      () => { alert('No se pudo obtener la ubicación GPS'); setBuscandoGPSDet(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const usarPlusCodeManualDetalle = () => {
    const code = normalizePlusCode(ubicInputDet, refCliente(cuentaDetalle?.cliente))
    if (!code) { alert('Plus Code no válido. Ej: 76C97H6P+QF'); return }
    const { lat, lng } = decodePlusCode(code)
    setUbicPendDet({ lat, lng, plus_code: code })
    setModoUbicDet('confirmar')
  }

  const guardarUbicacionDetalle = async () => {
    if (!ubicPendDet) return
    setGuardandoUbicDet(true)
    const idCliente = cuentaDetalle.cliente?.id_cliente
    const payload = { id_cliente: idCliente, latitud: ubicPendDet.lat, longitud: ubicPendDet.lng, plus_code: ubicPendDet.plus_code }
    const guardarLocalYSalir = () => {
      encolarUbicacion(payload)
      setPanelUbicDet(false)
      setModoUbicDet(null)
      setUbicPendDet(null)
      setUbicInputDet('')
      setExitoUbicDet('📴 Ubicación guardada localmente — se enviará cuando haya conexión')
      setTimeout(() => setExitoUbicDet(''), 4000)
    }
    if (!navigator.onLine) { guardarLocalYSalir(); setGuardandoUbicDet(false); return }
    try {
      await api.put(`/clientes/${idCliente}/coordenadas`, {
        latitud:   ubicPendDet.lat,
        longitud:  ubicPendDet.lng,
        plus_code: ubicPendDet.plus_code,
      }, { timeout: 10000 })
      setPanelUbicDet(false)
      setModoUbicDet(null)
      setUbicPendDet(null)
      setUbicInputDet('')
      setExitoUbicDet('Ubicación actualizada ✅')
      setTimeout(() => setExitoUbicDet(''), 4000)
    } catch (err) {
      if (err.response) alert(err.response.data?.error || 'Error al guardar la ubicación')
      else guardarLocalYSalir()
    } finally {
      setGuardandoUbicDet(false)
    }
  }

  const cambiarFlujo = (sinPago) => {
    setNoHuboPago(sinPago)
    setRegistrarVisitaTambien(false)
    setFormPago(FORM_PAGO_VACIO)
    setFormVisita({ ...FORM_VISITA_VACIO, tipo_seguimiento: sinPago ? 'no_localizado' : 'visita' })
    setError('')
    setExito('')
    setDatosPago(null)
  }

  const formatearTextoTicket = (datos) => {
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
      das,
      center('MONTO ABONADO'),
      center(fmt(datos.monto_pago)),
      row('Tipo:', tipoStr),
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

  const buildTicketHtml = (datos, logoSrc) => {
    const {
      id_pago, fecha_pago, monto_pago, saldo_anterior, saldo_nuevo,
      tipo_pago, origen_pago,
      cliente_nombre, numero_expediente, numero_cuenta, folio_cuenta, plan_actual,
      cobrador_nombre,
      precio_original_total, precio_final_total,
      pendienteSync,
    } = datos

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
    @page { size: 58mm auto; margin: 2mm 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
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

  const compartirTicket = async (datos) => {
    const folio = `TICKET-${String(datos.id_pago).padStart(6, '0')}`
    try {
      await navigator.share({ title: folio, text: formatearTextoTicket(datos) })
    } catch (e) {
      if (e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message)
    }
  }



  const generarTicket = (datos) => {
    const html = buildTicketHtml(datos, window.location.origin + '/logo.png')

    const ventana = window.open('', '_blank', 'width=350,height=650')
    if (!ventana) throw new Error('Popup bloqueado')
    ventana.document.write(html)
    ventana.document.close()
  }

  // Reimpresión de un ticket ya registrado — admin/supervisor, por si al
  // cobrador se le olvidó imprimirlo o compartirlo en el momento.
  const reimprimirTicket = (p) => {
    try {
      generarTicket({
        id_pago: p.id_pago,
        fecha_pago: p.fecha_pago,
        monto_pago: p.monto_pago,
        saldo_anterior: p.saldo_anterior,
        saldo_nuevo: p.saldo_nuevo,
        tipo_pago: p.tipo_pago,
        origen_pago: p.origen_pago,
        cliente_nombre: cuentaDetalle.cliente?.nombre,
        numero_expediente: cuentaDetalle.cliente?.numero_expediente,
        numero_cuenta: cuentaDetalle.numero_cuenta,
        folio_cuenta: cuentaDetalle.folio_cuenta,
        plan_actual: cuentaDetalle.plan_actual,
        cobrador_nombre: p.cobrador?.nombre || '—',
        precio_original_total: cuentaDetalle.venta?.precio_original_total,
        precio_final_total: cuentaDetalle.venta?.precio_final_total,
      })
    } catch {
      alert('El navegador bloqueó la ventana emergente. Habilítala para reimprimir el ticket.')
    }
  }

  const liquidarCuenta = () => {
    setFormPago(prev => ({
      ...prev,
      monto_pago: parseFloat(cuentaSeleccionada.saldo_actual || 0).toFixed(2),
      tipo_pago: 'liquidacion'
    }))
    setError('')
    setExito('')
  }

  const handleGuardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    setExito('')

    try {
      if (!noHuboPago) {
        // ── FLUJO 1: Registrar pago ──
        const monto = parseFloat(formPago.monto_pago)
        if (!formPago.monto_pago || monto <= 0) {
          setError('Ingresa un monto válido')
          return
        }

        const payloadPago = {
          id_cuenta: cuentaSeleccionada.id_cuenta,
          ...formPago,
          monto_pago: monto,
          ...(pagoHistorico && fechaPagoHistorico && { fecha_pago: fechaPagoHistorico }),
          // Misma clave en todos los reintentos (directo, cola offline, resincronización)
          // para que una respuesta perdida por señal mala no duplique el pago en el servidor.
          idempotency_key: crypto.randomUUID()
        }
        const datosVisitaExtra = (registrarVisitaTambien && formVisita.comentario.trim()) ? {
          id_cliente:       cuentaSeleccionada.id_cliente,
          id_cuenta:        cuentaSeleccionada.id_cuenta,
          tipo_seguimiento: 'visita',
          comentario:       formVisita.comentario.trim(),
          idempotency_key:  crypto.randomUUID()
        } : null

        const encolarPagoYSalir = () => {
          encolarPago({
            ...payloadPago,
            _meta: {
              cliente_nombre: cuentaSeleccionada.cliente?.nombre,
              folio_cuenta:   cuentaSeleccionada.folio_cuenta,
            }
          })
          if (datosVisitaExtra) encolarVisita(datosVisitaExtra)

          // Comprobante provisional con los datos disponibles localmente —
          // el saldo se confirma al sincronizar, pero el cobrador ya tiene
          // qué darle al cliente en el momento.
          const saldoAntes = parseFloat(cuentaSeleccionada.saldo_actual || 0)
          setDatosPago({
            id_pago:         'PENDIENTE',
            fecha_pago:      new Date().toISOString(),
            monto_pago:      monto,
            saldo_anterior:  saldoAntes,
            saldo_nuevo:     Math.max(0, saldoAntes - monto),
            tipo_pago:       formPago.tipo_pago,
            origen_pago:     formPago.origen_pago,
            cliente_nombre:  cuentaSeleccionada.cliente?.nombre,
            numero_expediente: cuentaSeleccionada.cliente?.numero_expediente,
            numero_cuenta:     cuentaSeleccionada.numero_cuenta,
            folio_cuenta:      cuentaSeleccionada.folio_cuenta,
            plan_actual:     cuentaSeleccionada.plan_actual,
            cobrador_nombre: usuario?.nombre || 'Cobrador',
            precio_original_total: cuentaSeleccionada.venta?.precio_original_total,
            precio_final_total:    cuentaSeleccionada.venta?.precio_final_total,
            pendienteSync: true,
          })
          setExito('__offline__')
          setFormPago(FORM_PAGO_VACIO)
          setFormVisita(FORM_VISITA_VACIO)
          setRegistrarVisitaTambien(false)
        }

        // ── Modo offline: encolar y salir ──
        if (!navigator.onLine) { encolarPagoYSalir(); return }

        let res
        try {
          res = await api.post('/pagos', payloadPago, { timeout: 10000 })
        } catch (err) {
          if (err.response) {
            setError(err.response.data?.error || 'Error al guardar')
            return
          }
          // Sin respuesta del servidor (señal mala o se agotó el tiempo): se encola
          // en vez de perder el pago.
          encolarPagoYSalir()
          return
        }

        // Si checkbox activo y hay comentario, registrar visita tipo "visita".
        // El pago ya se guardó; si esto falla por red, se encola aparte.
        if (datosVisitaExtra) {
          try {
            await api.post('/visitas', datosVisitaExtra, { timeout: 10000 })
          } catch (err) {
            if (!err.response) encolarVisita(datosVisitaExtra)
          }
        }

        const liquidada = res.data.estado_nuevo === 'liquidada'

        // Guardar datos para el ticket
        const ticket = {
          id_pago:         res.data.pago.id_pago,
          fecha_pago:      res.data.pago.fecha_pago,
          monto_pago:      res.data.pago.monto_pago,
          saldo_anterior:  res.data.pago.saldo_anterior,
          saldo_nuevo:     res.data.saldo_nuevo,
          tipo_pago:       res.data.pago.tipo_pago,
          origen_pago:     res.data.pago.origen_pago,
          cliente_nombre:  cuentaSeleccionada.cliente?.nombre,
          numero_expediente: cuentaSeleccionada.cliente?.numero_expediente,
          numero_cuenta:     cuentaSeleccionada.numero_cuenta,
          folio_cuenta:      cuentaSeleccionada.folio_cuenta,
          plan_actual:     cuentaSeleccionada.plan_actual,
          cobrador_nombre:       usuario?.nombre || 'Cobrador',
          precio_original_total: cuentaSeleccionada.venta?.precio_original_total,
          precio_final_total:    cuentaSeleccionada.venta?.precio_final_total
        }

        // No se cierra el modal ni se abre el ticket solo (ni siquiera al liquidar):
        // si el navegador bloquea la ventana emergente, el aviso quedaba invisible
        // porque el modal ya estaba cerrado. El cobrador ve "Ver comprobante" y lo
        // abre él mismo — evita depender del bloqueador de popups del navegador.
        if (liquidada) setCuentas(prev => prev.filter(c => c.id_cuenta !== cuentaSeleccionada.id_cuenta))
        setDatosPago(ticket)
        setExito(
          liquidada
            ? '🎉 ¡Cuenta liquidada!'
            : `Pago registrado. Saldo restante: $${parseFloat(res.data.saldo_nuevo).toLocaleString('es-MX', { minimumFractionDigits: 2 })} · ` +
              `Comisión: $${parseFloat(res.data.comision_cobrador).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
        )
        setFormPago(FORM_PAGO_VACIO)
        setFormVisita(FORM_VISITA_VACIO)
        setRegistrarVisitaTambien(false)
        if (modoRuta) marcarParada(cuentaSeleccionada.id_cuenta, 'pagado')
        cargarCuentas()
        // El pago ya se guardó; si esto falla (ej. se cortó la señal justo
        // después), no debe mostrarse como error — el pago sigue siendo válido.
        try {
          const [actualizada, nuevasVisitas] = await Promise.all([
            api.get(`/pagos/cuenta/${cuentaSeleccionada.id_cuenta}`),
            api.get(`/visitas/cuenta/${cuentaSeleccionada.id_cuenta}`)
          ])
          setCuentaSeleccionada(actualizada.data)
          setHistorialPagos(actualizada.data.pagos || [])
          setHistorialVisitas(nuevasVisitas.data)
        } catch {}
      } else {
        // ── FLUJO 2: Solo registrar visita ──
        if (formVisita.tipo_seguimiento === 'promesa_pago' && !formVisita.fecha_programada) {
          setError('Indica la fecha de la promesa de pago')
          return
        }

        const datosVisita = {
          id_cliente:       cuentaSeleccionada.id_cliente,
          id_cuenta:        cuentaSeleccionada.id_cuenta,
          tipo_seguimiento: formVisita.tipo_seguimiento,
          comentario:       formVisita.comentario || null,
          fecha_programada: formVisita.fecha_programada || null,
          idempotency_key:  crypto.randomUUID()
        }

        const encolarVisitaYSalir = () => {
          encolarVisita(datosVisita)
          setDatosPago(null) // no hubo pago; que no se muestre un ticket de una visita anterior
          setExito('__offline__')
          setFormVisita({ ...FORM_VISITA_VACIO, tipo_seguimiento: 'no_localizado' })
        }

        if (!navigator.onLine) { encolarVisitaYSalir(); return }

        try {
          await api.post('/visitas', datosVisita, { timeout: 10000 })
        } catch (err) {
          if (err.response) {
            setError(err.response.data?.error || 'Error al guardar')
            return
          }
          encolarVisitaYSalir()
          return
        }

        setExito('Visita registrada correctamente')
        setFormVisita({ ...FORM_VISITA_VACIO, tipo_seguimiento: 'no_localizado' })
        try {
          const nuevasVisitas = await api.get(`/visitas/cuenta/${cuentaSeleccionada.id_cuenta}`)
          setHistorialVisitas(nuevasVisitas.data)
        } catch {}
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const handleGuardarFrecuencia = async () => {
    setGuardandoFrecuencia(true)
    try {
      const res = await api.put(`/pagos/cuenta/${cuentaSeleccionada.id_cuenta}/frecuencia`, {
        frecuencia_pago:    formFrecuencia.frecuencia_pago,
        fecha_primer_cobro: formFrecuencia.fecha_primer_cobro || null,
        horario_preferido:  formFrecuencia.horario_preferido  || null,
      }, { timeout: 10000 })
      setCuentaSeleccionada(prev => ({ ...prev, ...res.data.cuenta }))
      setEditandoFrecuencia(false)
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      setGuardandoFrecuencia(false)
    }
  }

  const estaVencida = (c) =>
    c.fecha_limite &&
    new Date(c.fecha_limite) < new Date() &&
    !['liquidada', 'cancelada'].includes(c.estado_cuenta) &&
    c.plan_actual !== 'largo_plazo'

  const abrirFusion = async () => {
    try {
      const res = await api.get(`/cuentas/cliente/${cuentaSeleccionada.id_cliente}`, { timeout: 10000 })
      const otras = res.data.filter(c => c.id_cuenta !== cuentaSeleccionada.id_cuenta)
      setCuentasCliente(otras)
      setCuentasSecSel([])
      setErrorFusion('')
      setModalFusion(true)
    } catch {
      setErrorFusion('Error al cargar cuentas del cliente')
    }
  }

  const toggleCuentaSec = (id) => {
    setCuentasSecSel(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleFusionar = async () => {
    if (cuentasSecSel.length === 0) { setErrorFusion('Selecciona al menos una cuenta a fusionar'); return }
    setGuardandoFusion(true)
    setErrorFusion('')
    try {
      const res = await api.post('/cuentas/fusionar', {
        id_cuenta_principal:   cuentaSeleccionada.id_cuenta,
        id_cuentas_secundarias: cuentasSecSel,
      }, { timeout: 10000 })
      setModalFusion(false)
      cerrarModal()
      cargarCuentas()
      alert(`✅ Fusión completada.\nSaldo anterior: $${res.data.saldo_anterior.toFixed(2)}\nSaldo sumado: $${res.data.saldo_sumado.toFixed(2)}\nNuevo saldo: $${res.data.saldo_nuevo.toFixed(2)}`)
    } catch (err) {
      setErrorFusion(err.response?.data?.error || 'Error al fusionar cuentas')
    } finally {
      setGuardandoFusion(false)
    }
  }

  const abrirCancelar = () => {
    setMotivoCancelacion('')
    setNotasCancelacion('')
    setErrorCancelacion('')
    setModalCancelar(true)
  }

  const handleCancelarCuenta = async () => {
    if (!motivoCancelacion) { setErrorCancelacion('Selecciona un motivo'); return }
    setGuardandoCancelacion(true)
    setErrorCancelacion('')
    try {
      await api.post(`/cuentas/${cuentaSeleccionada.id_cuenta}/cancelar`, {
        motivo: motivoCancelacion,
        notas:  notasCancelacion,
      }, { timeout: 10000 })
      setModalCancelar(false)
      cerrarModal()
      cargarCuentas()
    } catch (err) {
      setErrorCancelacion(err.response?.data?.error || 'Error al cancelar')
    } finally {
      setGuardandoCancelacion(false)
    }
  }

  const abrirCambiarPlan = async () => {
    // Obtener preview del cambio desde el backend
    try {
      const res = await api.get('/cuentas/verificar-vencimientos', { timeout: 10000 })
      const info = res.data.find(v => v.id_cuenta === cuentaSeleccionada.id_cuenta)
      if (info?.nuevo_plan_sugerido) {
        setNuevoPlanSugerido(info.nuevo_plan_sugerido)
        setPreviewCambio({
          precio_anterior: parseFloat(cuentaSeleccionada.precio_plan_actual),
          precio_nuevo:    info.precio_nuevo_plan,
          saldo_anterior:  parseFloat(cuentaSeleccionada.saldo_actual),
          saldo_nuevo:     info.nuevo_saldo,
        })
      }
    } catch {
      // Si falla el preview, igual permitir selección manual
      const planes = SIGUIENTES_PLANES[cuentaSeleccionada.plan_actual] || []
      setNuevoPlanSugerido(planes[0] || null)
      setPreviewCambio(null)
    }
    setModalCambiarPlan(true)
  }

  const handleCambiarPlan = async () => {
    if (!nuevoPlanSugerido) return
    setGuardandoPlan(true)
    try {
      await api.post(`/cuentas/${cuentaSeleccionada.id_cuenta}/cambiar-plan`, { nuevo_plan: nuevoPlanSugerido }, { timeout: 10000 })
      setModalCambiarPlan(false)
      cerrarModal()
      cargarCuentas()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar el plan')
    } finally {
      setGuardandoPlan(false)
    }
  }

  const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  const normalizar = (s) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const toTitleCase = (s) =>
    (s || '').toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase())

  const estadoColor = {
    activa:  'bg-green-100 text-green-700',
    atraso:  'bg-yellow-100 text-yellow-700',
    moroso:  'bg-red-100 text-red-700',
  }

  const calcPagoPeriodico = (c) => {
    const base = c.abono_semanal
      ? parseFloat(c.abono_semanal)
      : Math.max(100, Math.ceil(parseFloat(c.precio_plan_actual || 0) / (c.semanas_plazo || 1)))
    switch (c.frecuencia_pago) {
      case 'quincenal': return { monto: base * 2,  label: '/quincenal' }
      case 'mensual':   return { monto: base * 4,  label: '/mes' }
      case 'dos_meses': return { monto: base * 8,  label: '/2 meses' }
      default:          return { monto: base,       label: '/semana' }
    }
  }

  const estadoSemanas = (semanas) => {
    if (!semanas) return null
    if (semanas === 1) return <span className="text-yellow-600 text-xs">1 semana de atraso</span>
    return <span className="text-red-600 text-xs font-medium">{semanas} semanas de atraso</span>
  }

  const formatearAtraso = (semanas) => {
    if (!semanas || semanas <= 0) return null
    const meses   = Math.floor(semanas / 4)
    const semsRest = semanas % 4
    const partes = []
    if (meses === 1)   partes.push('1 mes')
    else if (meses > 1) partes.push(`${meses} meses`)
    if (semsRest === 1)    partes.push('1 semana')
    else if (semsRest > 1) partes.push(`${semsRest} semanas`)
    return partes.join(' y ') + ' de atraso'
  }

  // ── Cálculo de cumplimiento (client-side) ─────────────────────────────────
  const DIAS_FRECUENCIA = { semanal: 7, quincenal: 15, mensual: 30, dos_meses: 60 }

  const calcularCumplimiento = (c) => {
    const dias = DIAS_FRECUENCIA[c.frecuencia_pago] || 7
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0)
    const base = c.fecha_ultimo_pago
      ? new Date(c.fecha_ultimo_pago)
      : c.fecha_primer_cobro ? new Date(c.fecha_primer_cobro) : null
    if (!base) return { diasAtraso: 0, tipo: 'sin_datos' }
    base.setHours(0, 0, 0, 0)
    const proximo = new Date(base)
    proximo.setDate(proximo.getDate() + dias)
    const diff = Math.ceil((hoy - proximo) / (1000 * 60 * 60 * 24)) // positivo = atrasado
    if (diff > 0)  return { diasAtraso: diff, tipo: 'atrasado' }
    if (diff === 0) return { diasAtraso: 0,   tipo: 'vence_hoy' }
    return { diasAtraso: diff, tipo: 'al_corriente' }
  }

  const badgeCumplimiento = (c) => {
    const { diasAtraso, tipo } = calcularCumplimiento(c)
    if (tipo === 'al_corriente')
      return <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium whitespace-nowrap">✓ Al corriente</span>
    if (tipo === 'vence_hoy')
      return <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium whitespace-nowrap">⚡ Vence hoy</span>
    if (tipo === 'atrasado')
      return <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium whitespace-nowrap">{diasAtraso}d atraso</span>
    return null
  }

  // Orden: atrasados primero (más días) → vence hoy → al corriente
  const prioridadCumplimiento = (c) => {
    const { diasAtraso, tipo } = calcularCumplimiento(c)
    if (tipo === 'atrasado')    return -diasAtraso      // mayor atraso = menor número (más arriba)
    if (tipo === 'vence_hoy')   return 0
    return 1
  }

  const rutasDisponibles = [...new Set(
    cuentas.map(c => c.cliente?.ruta).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'es'))

  // Deduplicar municipios normalizando (ignora mayúsculas/minúsculas y acentos)
  // Acotados a la ruta seleccionada, si hay una
  const municipiosMap = new Map()
  cuentas
    .filter(c => !filtroRuta || c.cliente?.ruta === filtroRuta)
    .forEach(c => {
      const raw = c.cliente?.municipio
      if (!raw) return
      const key = normalizar(raw)
      if (!municipiosMap.has(key)) municipiosMap.set(key, toTitleCase(raw))
    })
  const municipiosDisponibles = [...municipiosMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))

  const coloniasMap = new Map()
  cuentas
    .filter(c => !filtroRuta || c.cliente?.ruta === filtroRuta)
    .filter(c => !filtroMunicipio || normalizar(c.cliente?.municipio) === filtroMunicipio)
    .forEach(c => {
      const raw = c.cliente?.colonia
      if (!raw) return
      const key = normalizar(raw)
      if (!coloniasMap.has(key)) coloniasMap.set(key, toTitleCase(raw))
    })
  const coloniasDisponibles = [...coloniasMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))

  const hayFiltros = filtroEstado || filtroRuta || filtroMunicipio || filtroColonia || filtroDia || soloVencidas || ordenar !== 'cumplimiento'

  const tieneUbicacion = (c) => {
    const u = c.cliente?.ubicaciones?.[0]
    return !!(u?.latitud || c.cliente?.latitud)
  }
  // Enlace directo a Maps con la ubicación guardada, para verla de
  // referencia en modo cobranza sin tener que abrir "Ver detalle".
  const enlaceMapaCliente = (c) => {
    const u = c.cliente?.ubicaciones?.[0]
    const plusCode = u?.plus_code || c.cliente?.plus_code
    if (plusCode) return `https://maps.google.com/?q=${encodeURIComponent(plusCode)}`
    const lat = u?.latitud ?? c.cliente?.latitud
    const lng = u?.longitud ?? c.cliente?.longitud
    if (lat && lng) return `https://maps.google.com/?q=${lat},${lng}`
    return null
  }
  const sinUbicacionCount = modoCobranza ? cuentasDelDiaFiltro.filter(c => !tieneUbicacion(c)).length : 0

  const cuentasFiltradas = cuentas
    .filter(c => {
      if (soloVencidas && !estaVencida(c)) return false
      if (filtroEstado && c.estado_cuenta !== filtroEstado) return false
      if (filtroRuta && c.cliente?.ruta !== filtroRuta) return false
      if (filtroMunicipio && normalizar(c.cliente?.municipio) !== filtroMunicipio) return false
      if (filtroColonia  && normalizar(c.cliente?.colonia)  !== filtroColonia)  return false
      if (filtroDia && c.cliente?.dia_cobranza !== filtroDia) return false
      const q = normalizar(busqueda)
      if (q) return (
        normalizar(c.cliente?.nombre).includes(q) ||
        normalizar(c.folio_cuenta).includes(q) ||
        // Prefijo, no "contiene": si no, buscar "1-C" también encontraría "11-C", "21-C", "101-C"...
        normalizar(c.numero_cuenta).startsWith(q) ||
        normalizar(c.cliente?.numero_expediente).includes(q) ||
        normalizar(c.cliente?.municipio).includes(q) ||
        normalizar(c.cliente?.colonia).includes(q)
      )
      return true
    })
    .sort((a, b) => {
      // En modo cobranza el orden manual/GPS de la ruta siempre manda,
      // sin depender de que "Ordenar" esté puesto en "Por ruta de cobranza"
      if (modoCobranza) {
        const pa = ordenManual.indexOf(a.id_cuenta); const pb = ordenManual.indexOf(b.id_cuenta)
        return (pa === -1 ? 9999 : pa) - (pb === -1 ? 9999 : pb)
      }
      switch (ordenar) {
        case 'nombre_az':   return (a.cliente?.nombre || '').localeCompare(b.cliente?.nombre || '', 'es')
        case 'nombre_za':   return (b.cliente?.nombre || '').localeCompare(a.cliente?.nombre || '', 'es')
        case 'cuenta_asc':  return (a.numero_cuenta || a.folio_cuenta || '').localeCompare(b.numero_cuenta || b.folio_cuenta || '', 'es', { numeric: true })
        case 'cuenta_desc': return (b.numero_cuenta || b.folio_cuenta || '').localeCompare(a.numero_cuenta || a.folio_cuenta || '', 'es', { numeric: true })
        case 'saldo_asc':   return parseFloat(a.saldo_actual) - parseFloat(b.saldo_actual)
        case 'saldo_desc':  return parseFloat(b.saldo_actual) - parseFloat(a.saldo_actual)
        case 'municipio':   return (a.cliente?.municipio || '').localeCompare(b.cliente?.municipio || '', 'es')
        case 'ultimo_pago': {
          const fa = a.fecha_ultimo_pago ? new Date(a.fecha_ultimo_pago) : new Date(0)
          const fb = b.fecha_ultimo_pago ? new Date(b.fecha_ultimo_pago) : new Date(0)
          return fb - fa
        }
        case 'ruta': {
          const pa = ordenManual.indexOf(a.id_cuenta); const pb = ordenManual.indexOf(b.id_cuenta)
          return (pa === -1 ? 9999 : pa) - (pb === -1 ? 9999 : pb)
        }
        default:            return prioridadCumplimiento(a) - prioridadCumplimiento(b)
      }
    })
    .filter(c => !modoCobranza || !soloPendientes || !visitados.has(c.id_cuenta))
    .filter(c => !modoCobranza || !ocultosRuta.has(c.id_cuenta))

  const totalVencidas    = cuentas.filter(estaVencida).length
  const totalVisitados   = modoCobranza ? [...visitados].filter(id => cuentasFiltradas.find(c => c.id_cuenta === id) || visitados.has(id)).length : 0
  const pendientesModo   = modoCobranza ? cuentasFiltradas.filter(c => !visitados.has(c.id_cuenta)).length : 0

  const conteoPorDia = modoTarjetero
    ? DIAS_COBRANZA.reduce((acc, d) => { acc[d] = cuentas.filter(c => c.cliente?.dia_cobranza === d).length; return acc }, {})
    : {}
  const sinDiaCount = modoTarjetero ? cuentas.filter(c => !c.cliente?.dia_cobranza).length : 0
  const cuentasTarjetero = modoTarjetero
    ? cuentasFiltradas.filter(c => !soloSinDia || !c.cliente?.dia_cobranza)
    : []

  const saldo          = parseFloat(cuentaSeleccionada?.saldo_actual || 0)
  const montoIngresado = parseFloat(formPago.monto_pago || 0)
  const saldoTrasAbono = isNaN(montoIngresado) ? saldo : Math.max(0, saldo - montoIngresado)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Cobranza</h2>
          <p className="text-gray-500 text-sm mt-1">{cuentas.length} cuentas activas
            {totalVencidas > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                {totalVencidas} plan(es) vencido(s)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalVencidas > 0 && !modoCobranza && (
            <button
              onClick={() => setSoloVencidas(!soloVencidas)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition border ${
                soloVencidas
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100'
              }`}
            >
              {soloVencidas ? '⚠️ Mostrando vencidas' : '⚠️ Ver vencidas'}
            </button>
          )}
          {!modoCobranza && !modoRuta && (
            <button
              onClick={toggleModoTarjetero}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition border ${
                modoTarjetero
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {modoTarjetero ? '✓ Salir de organizar tarjetero' : '🗂️ Organizar mi tarjetero'}
            </button>
          )}
          {!modoTarjetero && !modoRuta && (
            <button
              onClick={modoCobranza ? salirModoCobranza : activarModoCobranza}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition border ${
                modoCobranza
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {modoCobranza ? '✓ Salir modo cobranza' : '☑ Modo cobranza'}
            </button>
          )}
          {!modoCobranza && !modoTarjetero && rutaImportada.length > 0 && (
            <button
              onClick={modoRuta ? salirModoRuta : activarModoRuta}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition border ${
                modoRuta
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {modoRuta ? '✓ Salir de ruta del mapa' : '🧭 Ruta del mapa'}
            </button>
          )}
        </div>
      </div>

      {/* Barra de progreso — modo cobranza */}
      {modoCobranza && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              {filtroDia && (
                <span className="block text-xs font-semibold text-green-700 uppercase tracking-wide mb-0.5">
                  📅 {LABEL_DIA_COBRANZA[filtroDia]}
                </span>
              )}
              <span className="text-sm font-semibold text-green-800">
                {visitados.size} visitado{visitados.size !== 1 ? 's' : ''}
              </span>
              <span className="text-sm text-green-600 ml-1">
                de {cuentasFiltradas.length + (soloPendientes ? visitados.size : 0)} en lista
              </span>
            </div>
            <button
              onClick={() => setSoloPendientes(!soloPendientes)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition border ${
                soloPendientes
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-green-700 border-green-300 hover:bg-green-100'
              }`}
            >
              {soloPendientes ? 'Mostrando pendientes' : 'Solo pendientes'}
            </button>
          </div>
          <div className="w-full bg-green-100 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${
                  (cuentasFiltradas.length + (soloPendientes ? visitados.size : 0)) > 0
                    ? (visitados.size / (cuentasFiltradas.length + (soloPendientes ? visitados.size : 0))) * 100
                    : 0
                }%`
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            {visitados.size > 0 && (
              <button
                onClick={() => setVisitados(new Set())}
                className="text-xs text-green-600 hover:text-green-800"
              >
                Reiniciar checklist
              </button>
            )}
            <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
              {ocultosRuta.size > 0 && (
                <button
                  onClick={() => setOcultosRuta(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium border border-gray-300 rounded-lg px-2 py-1"
                >
                  👁️ Mostrar {ocultosRuta.size} oculto{ocultosRuta.size !== 1 ? 's' : ''}
                </button>
              )}
              {sinUbicacionCount > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  ⚠️ {sinUbicacionCount} sin ubicación (van al final)
                </span>
              )}
              <button
                onClick={() => pedirGPSYCalcular(cuentasDelDiaFiltro)}
                className="text-xs text-green-700 hover:text-green-900 font-medium underline"
              >
                Recalcular ruta
              </button>
            </div>
          </div>
        </div>
      )}

      {!modoRuta && (
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Buscar por cliente, folio, municipio..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {modoCobranza ? (
            <span className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 font-medium">
              📍 Arrastra las tarjetas para acomodar tu ruta
            </span>
          ) : (
            <select
              value={ordenar}
              onChange={e => setOrdenar(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="cumplimiento">Ordenar: Cumplimiento</option>
              <option value="nombre_az">Nombre A → Z</option>
              <option value="nombre_za">Nombre Z → A</option>
              <option value="cuenta_asc">No. cuenta ↑</option>
              <option value="cuenta_desc">No. cuenta ↓</option>
              <option value="saldo_asc">Saldo menor → mayor</option>
              <option value="saldo_desc">Saldo mayor → menor</option>
              <option value="municipio">Municipio A → Z</option>
              <option value="ultimo_pago">Último pago reciente</option>
            </select>
          )}

          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Estado: Todos</option>
            <option value="activa">Activa</option>
            <option value="atraso">Atraso</option>
            <option value="moroso">Moroso</option>
          </select>

          {rutasDisponibles.length > 0 && (
            <select
              value={filtroRuta}
              onChange={e => { setFiltroRuta(e.target.value); setFiltroMunicipio(''); setFiltroColonia('') }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Ruta: Todas</option>
              {rutasDisponibles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}

          {municipiosDisponibles.length > 0 && (
            <select
              value={filtroMunicipio}
              onChange={e => { setFiltroMunicipio(e.target.value); setFiltroColonia('') }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Municipio: Todos</option>
              {municipiosDisponibles.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {coloniasDisponibles.length > 0 && (
            <select
              value={filtroColonia}
              onChange={e => setFiltroColonia(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Localidad: Todas</option>
              {coloniasDisponibles.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {usaDiasCobranza && (
            <select
              value={filtroDia || ''}
              onChange={e => setFiltroDia(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Día: Todos</option>
              {DIAS_COBRANZA.map(d => (
                <option key={d} value={d}>{LABEL_DIA_COBRANZA[d]}</option>
              ))}
            </select>
          )}

          {hayFiltros && (
            <button
              onClick={() => { setOrdenar(modoCobranza ? 'ruta' : 'cumplimiento'); setFiltroEstado(''); setFiltroRuta(''); setFiltroMunicipio(''); setFiltroColonia(''); setFiltroDia(''); setSoloVencidas(false) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition"
            >
              ✕ Limpiar filtros
            </button>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            {cuentasFiltradas.length} de {cuentas.length}
          </span>
        </div>
      </div>
      )}

      {modoRuta ? (
        <PanelRutaMapa
          paradas={rutaImportada.map(id => cuentas.find(c => c.id_cuenta === id)).filter(Boolean)}
          paso={pasoRuta}
          setPaso={setPasoRuta}
          estados={paradasRuta}
          meta={rutaMeta}
          fmt={fmt}
          enlaceMapaCliente={enlaceMapaCliente}
          onRegistrarPago={abrirModal}
          onMarcar={marcarParada}
          verCompleta={verRutaCompleta}
          setVerCompleta={setVerRutaCompleta}
          onSalir={salirModoRuta}
        />
      ) : modoTarjetero ? (
        <div className="space-y-3">
          {/* Contador por día */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 flex flex-wrap gap-x-4 gap-y-1">
            {DIAS_COBRANZA.map(d => (
              <span key={d} className="text-xs font-medium text-purple-800">
                {LABEL_DIA_COBRANZA[d]}: <strong>{conteoPorDia[d] || 0}</strong>
              </span>
            ))}
            <span className="text-xs font-medium text-gray-500 ml-auto">
              Sin día: <strong>{sinDiaCount}</strong>
            </span>
          </div>

          <button
            onClick={() => setSoloSinDia(!soloSinDia)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition border ${
              soloSinDia
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'
            }`}
          >
            {soloSinDia ? 'Mostrando solo sin día' : 'Mostrar solo sin asignar'}
          </button>

          {cargando ? (
            <p className="text-center text-gray-500 py-12">Cargando...</p>
          ) : errorCarga ? (
            <p className="text-center text-red-500 py-12">📴 Sin conexión y sin datos guardados. Revisa tu señal e intenta de nuevo.</p>
          ) : cuentasTarjetero.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No hay cuentas que mostrar</p>
          ) : (
            <div className="bg-white rounded-2xl shadow divide-y divide-gray-100">
              {cuentasTarjetero.map(c => (
                <div key={c.id_cuenta} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800 truncate">{c.cliente?.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {c.cliente?.colonia || c.cliente?.municipio || '—'}
                      {c.numero_cuenta && <span className="ml-2 text-blue-600 font-mono">Cta. {c.numero_cuenta}</span>}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap shrink-0">
                    {DIAS_COBRANZA.map(d => {
                      const activo = c.cliente?.dia_cobranza === d
                      return (
                        <button
                          key={d}
                          onClick={() => cambiarDiaCliente(c, activo ? '' : d)}
                          className={`w-9 h-9 rounded-lg text-xs font-semibold transition border ${
                            activo
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-purple-400'
                          }`}
                          title={LABEL_DIA_COBRANZA[d]}
                        >
                          {LABEL_DIA_COBRANZA[d].slice(0, 2)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Cards — móvil */}
      <div className="sm:hidden space-y-3">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : errorCarga ? (
          <p className="text-center text-red-500 py-12">📴 Sin conexión y sin datos guardados. Revisa tu señal e intenta de nuevo.</p>
        ) : cuentasFiltradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay cuentas activas</p>
        ) :(() => {
          const renderCard = (c, dragListeners) => {
            const esVisitado = visitados.has(c.id_cuenta)
            const pos = modoCobranza ? ordenManual.indexOf(c.id_cuenta) : -1
            return (
              <div className={`rounded-2xl shadow p-4 transition-all ${esVisitado ? 'bg-green-50 border border-green-200' : 'bg-white'}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {dragListeners && (
                        <button
                          {...dragListeners}
                          className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 touch-none cursor-grab active:cursor-grabbing"
                          aria-label="Arrastrar para reordenar"
                        >
                          <span className="text-base leading-none">☰</span>
                        </button>
                      )}
                      {modoCobranza && (
                        <button
                          onClick={() => toggleVisitado(c.id_cuenta)}
                          className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                            esVisitado ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {esVisitado && <span className="text-xs font-bold">✓</span>}
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className={`font-semibold truncate ${esVisitado ? 'text-green-800' : 'text-gray-800'}`}>
                          {pos >= 0 && (
                            editandoPosicion === c.id_cuenta ? (
                              <input
                                autoFocus
                                type="number"
                                min={1}
                                max={ordenManual.length}
                                defaultValue={pos + 1}
                                className="w-12 text-xs font-bold text-blue-600 border border-blue-400 rounded px-1 mr-1 inline-block"
                                onKeyDown={e => { if (e.key === 'Enter') moverAPosicion(c.id_cuenta, e.target.value) }}
                                onBlur={e => moverAPosicion(c.id_cuenta, e.target.value)}
                              />
                            ) : (
                              <button
                                onClick={() => setEditandoPosicion(c.id_cuenta)}
                                className="text-xs font-bold text-blue-500 mr-1 hover:text-blue-700 hover:underline"
                                title="Toca para cambiar posición"
                              >#{pos + 1}</button>
                            )
                          )}
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => abrirDetalle(c)}
                            className="hover:underline cursor-pointer"
                          >
                            {c.cliente?.nombre}
                          </span>
                          {modoCobranza && !tieneUbicacion(c) && <span className="text-xs text-amber-500 ml-1 font-normal">⚠️</span>}
                        </p>
                        {c.numero_cuenta
                          ? <p className="text-blue-600 text-xs font-mono font-semibold">Cta. {c.numero_cuenta}</p>
                          : <p className="text-gray-400 text-xs font-mono">{c.folio_cuenta}</p>
                        }
                        {c.cliente?.colonia && <p className="text-gray-400 text-xs">{c.cliente.colonia}</p>}
                        {modoCobranza && tieneUbicacion(c) && (
                          <a
                            href={enlaceMapaCliente(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-blue-500 text-xs inline-flex items-center gap-0.5 hover:underline"
                          >
                            📍 Ver ubicación
                          </a>
                        )}
                        {estadoSemanas(c.semanas_atraso)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {modoCobranza && (
                      <button
                        onClick={() => toggleOculto(c.id_cuenta)}
                        className="text-gray-300 hover:text-gray-500 text-base leading-none"
                        title="Ocultar de la ruta de hoy"
                      >👁️</button>
                    )}
                    {modoCobranza && usaDiasCobranza && (
                      <select
                        value={c.cliente?.dia_cobranza || ''}
                        onChange={e => cambiarDiaCliente(c, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        title="Cambiar el día de cobranza de este cliente"
                        className="text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 text-gray-500 bg-white"
                      >
                        <option value="">Sin día</option>
                        {DIAS_COBRANZA.map(d => (
                          <option key={d} value={d}>{LABEL_DIA_COBRANZA[d]}</option>
                        ))}
                      </select>
                    )}
                    {esVisitado && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Visitado</span>
                    )}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[c.estado_cuenta]}`}>
                      {c.estado_cuenta}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-gray-400">Saldo</p>
                    <p className={`text-xl font-bold ${esVisitado ? 'text-green-700' : 'text-gray-800'}`}>{fmt(c.saldo_actual)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Plan</p>
                    <p className="text-sm text-gray-600">{c.plan_actual?.replace(/_/g, ' ')}</p>
                    {estaVencida(c) && (
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">Plan vencido</span>
                    )}
                  </div>
                </div>
                <div className="mb-3">{badgeCumplimiento(c)}</div>
                <div className="flex gap-2">
                  {c.cliente?.telefono && (
                    <a
                      href={`tel:${c.cliente.telefono}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl text-sm font-semibold transition border border-green-200 shrink-0"
                      title={c.cliente.telefono}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.47 11.47 0 00.57 3.58 1 1 0 01-.25 1.02l-2.2 2.19z"/>
                      </svg>
                      <span className="text-xs">{c.cliente.telefono}</span>
                    </a>
                  )}
                  {modoCobranza && (
                    <button
                      onClick={() => toggleVisitado(c.id_cuenta)}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold transition border-2 ${
                        esVisitado
                          ? 'bg-green-100 border-green-400 text-green-700 hover:bg-green-200'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-600'
                      }`}
                    >
                      {esVisitado ? '✓ Visitado' : 'Marcar visitado'}
                    </button>
                  )}
                  {!modoCobranza && (
                    <button
                      onClick={() => abrirDetalle(c)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-semibold transition"
                    >
                      Ver detalle
                    </button>
                  )}
                  <button
                    onClick={() => abrirModal(c)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold transition"
                  >
                    Registrar pago
                  </button>
                </div>
              </div>
            )
          }

          if (modoCobranza) {
            return (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={cuentasFiltradas.map(c => String(c.id_cuenta))} strategy={verticalListSortingStrategy}>
                  {cuentasFiltradas.map(c => (
                    <SortableCardWrapper key={c.id_cuenta} id={String(c.id_cuenta)}>
                      {(listeners) => renderCard(c, listeners)}
                    </SortableCardWrapper>
                  ))}
                </SortableContext>
              </DndContext>
            )
          }
          return cuentasFiltradas.map(c => (
            <div key={c.id_cuenta}>{renderCard(c, null)}</div>
          ))
        })()}
      </div>

      {/* Tabla — desktop */}
      <div className="hidden sm:block bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : errorCarga ? (
          <p className="text-center text-red-500 py-12">📴 Sin conexión y sin datos guardados. Revisa tu señal e intenta de nuevo.</p>
        ) : cuentasFiltradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay cuentas activas</p>
        ) :(
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {modoCobranza && <th className="px-4 py-3 w-10"></th>}
                  {modoCobranza && <th className="px-2 py-3 w-16 text-gray-400 font-medium text-xs text-center">Orden</th>}
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Cliente</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Cuenta</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Plan</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Frecuencia</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Saldo</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Último pago</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Cumplimiento</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Estado</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cuentasFiltradas.map(c => {
                  const esVisitado = visitados.has(c.id_cuenta)
                  return (
                  <tr key={c.id_cuenta} className={`transition ${esVisitado ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                    {modoCobranza && (
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleVisitado(c.id_cuenta)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                            esVisitado ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                          }`}
                        >
                          {esVisitado && <span className="text-xs font-bold">✓</span>}
                        </button>
                      </td>
                    )}
                    {modoCobranza && (() => {
                      const posIdx = ordenManual.indexOf(c.id_cuenta)
                      return (
                        <td className="px-2 py-4">
                          <div className="flex flex-col items-center gap-0.5">
                            {editandoPosicion === c.id_cuenta ? (
                              <input
                                autoFocus
                                type="number"
                                min={1}
                                max={ordenManual.length}
                                defaultValue={posIdx + 1}
                                className="w-12 text-xs font-bold text-blue-600 border border-blue-400 rounded px-1 text-center"
                                onKeyDown={e => { if (e.key === 'Enter') moverAPosicion(c.id_cuenta, e.target.value) }}
                                onBlur={e => moverAPosicion(c.id_cuenta, e.target.value)}
                              />
                            ) : (
                              <button
                                onClick={() => setEditandoPosicion(c.id_cuenta)}
                                className="text-xs text-blue-500 font-bold hover:underline"
                                title="Clic para cambiar posición"
                              >
                                #{posIdx >= 0 ? posIdx + 1 : '—'}
                              </button>
                            )}
                            <button onClick={() => moverEnOrden(c.id_cuenta, -1)} className="text-gray-400 hover:text-gray-700 text-sm leading-none">↑</button>
                            <button onClick={() => moverEnOrden(c.id_cuenta, 1)} className="text-gray-400 hover:text-gray-700 text-sm leading-none">↓</button>
                          </div>
                        </td>
                      )
                    })()}
                    <td className="px-6 py-4">
                      <p className={`font-medium ${esVisitado ? 'text-green-800' : 'text-gray-800'}`}>
                        <span role="button" tabIndex={0} onClick={() => abrirDetalle(c)} className="hover:underline cursor-pointer">
                          {c.cliente?.nombre}
                        </span>
                      </p>
                      {c.cliente?.colonia && <p className="text-xs text-gray-400">{c.cliente.colonia}</p>}
                      {modoCobranza && !tieneUbicacion(c) && <span className="text-xs text-amber-500">⚠️ Sin ubicación</span>}
                      {modoCobranza && tieneUbicacion(c) && (
                        <a
                          href={enlaceMapaCliente(c)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-blue-500 text-xs block hover:underline"
                        >
                          📍 Ver ubicación
                        </a>
                      )}
                      {estadoSemanas(c.semanas_atraso)}
                      {esVisitado && <span className="text-xs text-green-600 font-medium">✓ Visitado</span>}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {c.numero_cuenta
                        ? <span className="text-blue-600 font-semibold">{c.numero_cuenta}</span>
                        : <span className="text-gray-400">{c.folio_cuenta}</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <span className="text-gray-600">{c.plan_actual?.replace(/_/g, ' ')}</span>
                      {estaVencida(c) && (
                        <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">Plan vencido</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      <span className="capitalize">{c.frecuencia_pago?.replace(/_/g, ' ') || 'semanal'}</span>
                      {c.horario_preferido && <p className="text-gray-400">{c.horario_preferido}</p>}
                    </td>
                    <td className={`px-6 py-4 font-bold ${esVisitado ? 'text-green-700' : 'text-gray-800'}`}>{fmt(c.saldo_actual)}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {c.fecha_ultimo_pago
                        ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
                        : 'Sin pagos'}
                    </td>
                    <td className="px-6 py-4">{badgeCumplimiento(c)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[c.estado_cuenta]}`}>
                        {c.estado_cuenta}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {modoCobranza && (
                          <>
                            <button
                              onClick={() => toggleVisitado(c.id_cuenta)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                                esVisitado
                                  ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200'
                                  : 'bg-white border-gray-300 text-gray-600 hover:border-green-400'
                              }`}
                            >
                              {esVisitado ? '✓ Visitado' : 'Marcar'}
                            </button>
                            <button
                              onClick={() => toggleOculto(c.id_cuenta)}
                              className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                              title="Ocultar de la ruta de hoy"
                            >👁️</button>
                            {usaDiasCobranza && (
                              <select
                                value={c.cliente?.dia_cobranza || ''}
                                onChange={e => cambiarDiaCliente(c, e.target.value)}
                                title="Cambiar el día de cobranza de este cliente"
                                className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 text-gray-500 bg-white"
                              >
                                <option value="">Sin día</option>
                                {DIAS_COBRANZA.map(d => (
                                  <option key={d} value={d}>{LABEL_DIA_COBRANZA[d]}</option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                        {!modoCobranza && (
                          <button
                            onClick={() => abrirDetalle(c)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          >
                            Ver detalle
                          </button>
                        )}
                        <button
                          onClick={() => abrirModal(c)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                        >
                          Registrar pago
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* ──────────────── MODAL ──────────────── */}
      {modalAbierto && cuentaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl h-[95svh] sm:h-auto sm:max-h-[95vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{cuentaSeleccionada.cliente?.nombre}</h3>
                <p className="text-gray-500 text-sm">
                  {cuentaSeleccionada.numero_cuenta
                    ? <span className="text-blue-600 font-semibold">No. cuenta: {cuentaSeleccionada.numero_cuenta}</span>
                    : cuentaSeleccionada.folio_cuenta
                  }
                </p>
              </div>
              <div className="flex items-center gap-2">
                {['cobrador','jefe_camioneta','administrador'].includes(usuario?.rol) && (
                  <button
                    type="button"
                    onClick={panelUbicacion ? cerrarCorreccionUbicacion : abrirCorreccionUbicacion}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition min-h-[36px] ${
                      panelUbicacion
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    📍 {panelUbicacion ? 'Cancelar' : 'Corregir ubicación'}
                  </button>
                )}
                <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>

            {datosLimitados && (
              <div className="px-4 md:px-6 py-2 bg-amber-50 border-b border-amber-200">
                <p className="text-amber-800 text-xs font-medium">
                  📴 Sin conexión: mostrando datos guardados de la lista, sin historial de pagos reciente.
                </p>
              </div>
            )}

            {/* Panel corrección de ubicación */}
            {panelUbicacion && (
              <div className="px-4 md:px-6 py-4 border-b bg-blue-50">
                {modoUbicacion === 'opciones' && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-3">¿Cómo quieres corregir la ubicación?</p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={usarGPSUbicacion}
                        disabled={buscandoGPS}
                        className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-4 py-3 text-left hover:bg-blue-50 transition disabled:opacity-50"
                      >
                        <span className="text-2xl">🎯</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">
                            {buscandoGPS ? 'Obteniendo GPS…' : 'Usar mi ubicación actual'}
                          </p>
                          <p className="text-xs text-gray-500">Captura las coordenadas GPS de tu celular</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoUbicacion('manual')}
                        className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-4 py-3 text-left hover:bg-blue-50 transition"
                      >
                        <span className="text-2xl">⌨️</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">Ingresar Plus Code</p>
                          <p className="text-xs text-gray-500">Escribe manualmente el código de ubicación</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {modoUbicacion === 'manual' && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-2">Ingresa el Plus Code</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ubicInput}
                        onChange={e => setUbicInput(e.target.value)}
                        placeholder="Ej: 76C97H6P+QF"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={usarPlusCodeManualUbicacion}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        Verificar
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModoUbicacion('opciones')}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      ← Volver
                    </button>
                  </div>
                )}

                {modoUbicacion === 'confirmar' && ubicPendiente && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-3">
                      ¿Guardar esta ubicación para {cuentaSeleccionada.cliente?.nombre}?
                    </p>
                    <div className="bg-white border border-blue-200 rounded-xl px-4 py-3 mb-3">
                      <p className="text-xs text-gray-500 mb-1">Plus Code generado</p>
                      <p className="font-mono font-bold text-blue-700 text-base">{ubicPendiente.plus_code}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {ubicPendiente.lat.toFixed(6)}, {ubicPendiente.lng.toFixed(6)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setModoUbicacion('opciones')}
                        className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm"
                      >
                        Cambiar
                      </button>
                      <button
                        type="button"
                        onClick={guardarUbicacionCliente}
                        disabled={guardandoUbic}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                      >
                        {guardandoUbic ? 'Guardando…' : 'Guardar ubicación ✅'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Info de la cuenta */}
            <div className="p-4 md:p-6 border-b bg-gray-50">
              {/* Banner plan vencido */}
              {estaVencida(cuentaSeleccionada) && (
                <div className="mb-4 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-orange-800 text-sm font-semibold">⚠️ Plan vencido por incumplimiento</p>
                    <p className="text-orange-600 text-xs mt-0.5">
                      Venció el {new Date(cuentaSeleccionada.fecha_limite).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })} —
                      Plan actual: {LABEL_PLAN[cuentaSeleccionada.plan_actual]}
                    </p>
                  </div>
                  {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && (
                    <button type="button" onClick={abrirCambiarPlan}
                      className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition min-h-[44px]">
                      Cambiar plan
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 md:gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Saldo restante</p>
                  <p className="text-xl md:text-2xl font-bold text-gray-800">{fmt(cuentaSeleccionada.saldo_actual)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Plan</p>
                  <p className="font-medium text-gray-700">{cuentaSeleccionada.plan_actual?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Estado</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[cuentaSeleccionada.estado_cuenta]}`}>
                    {cuentaSeleccionada.estado_cuenta}
                  </span>
                </div>
              </div>

              {/* Acciones admin: Fusionar y Cancelar */}
              {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && (
                <div className="mt-3 flex justify-end gap-2">
                  {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && (
                    <button
                      type="button"
                      onClick={abrirFusion}
                      className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg font-medium active:bg-purple-100"
                    >
                      Fusionar cuentas
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={abrirCancelar}
                    className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-medium active:bg-red-100"
                  >
                    Cancelar cuenta
                  </button>
                </div>
              )}

              {/* Precio original vs plan */}
              {cuentaSeleccionada.venta && (
                <div className="mt-3 text-xs text-center space-y-0.5">
                  <div className="flex items-center justify-center gap-3 text-gray-400">
                    <span className="line-through">Precio original: {fmt(cuentaSeleccionada.venta.precio_original_total)}</span>
                    <span>·</span>
                    <span className="text-gray-500">Precio del plan: {fmt(cuentaSeleccionada.venta.precio_final_total)}</span>
                  </div>
                  {parseFloat(cuentaSeleccionada.venta.precio_original_total) > parseFloat(cuentaSeleccionada.venta.precio_final_total) && (
                    <p className="text-green-600 font-medium">
                      El cliente se ahorró {fmt(parseFloat(cuentaSeleccionada.venta.precio_original_total) - parseFloat(cuentaSeleccionada.venta.precio_final_total))}
                    </p>
                  )}
                </div>
              )}

              {/* Liquidar */}
              {!noHuboPago && (
                <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Para liquidar hoy</p>
                    <p className="text-xl font-bold text-blue-700">{fmt(cuentaSeleccionada.saldo_actual)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={liquidarCuenta}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                  >
                    Liquidar cuenta
                  </button>
                </div>
              )}

              {/* Artículos */}
              {cuentaSeleccionada.venta?.detalles?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-2">Artículos:</p>
                  <div className="flex flex-wrap gap-2">
                    {cuentaSeleccionada.venta.detalles.map(d => (
                      <span key={d.id_detalle_venta} className="bg-white border border-gray-200 px-3 py-1 rounded-full text-xs text-gray-700">
                        {d.producto} x{d.cantidad}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel de frecuencia de cobro ── */}
            <div className="px-4 md:px-6 py-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">Frecuencia de cobro</p>
                {!editandoFrecuencia && (
                  <button
                    type="button"
                    onClick={() => setEditandoFrecuencia(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Editar
                  </button>
                )}
              </div>

              {!editandoFrecuencia ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Frecuencia</p>
                    <p className="font-medium text-gray-700 capitalize">
                      {(cuentaSeleccionada.frecuencia_pago || 'semanal').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Primer cobro</p>
                    <p className="font-medium text-gray-700">
                      {cuentaSeleccionada.fecha_primer_cobro
                        ? new Date(cuentaSeleccionada.fecha_primer_cobro).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Horario preferido</p>
                    <p className="font-medium text-gray-700">{cuentaSeleccionada.horario_preferido || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Frecuencia</label>
                      <select
                        value={formFrecuencia.frecuencia_pago}
                        onChange={e => setFormFrecuencia({ ...formFrecuencia, frecuencia_pago: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="semanal">Semanal</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="mensual">Mensual</option>
                        <option value="dos_meses">Cada 2 meses</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fecha primer cobro</label>
                      <input
                        type="date"
                        value={formFrecuencia.fecha_primer_cobro}
                        onChange={e => setFormFrecuencia({ ...formFrecuencia, fecha_primer_cobro: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Horario preferido</label>
                      <input
                        type="text"
                        value={formFrecuencia.horario_preferido}
                        onChange={e => setFormFrecuencia({ ...formFrecuencia, horario_preferido: e.target.value })}
                        placeholder="Ej: Mañanas, 10–12 am"
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditandoFrecuencia(false)}
                      className="flex-1 border border-gray-300 text-gray-600 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleGuardarFrecuencia}
                      disabled={guardandoFrecuencia}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      {guardandoFrecuencia ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Toggle de flujo ── */}
            <div className="px-4 md:px-6 pt-5 pb-2">
              <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => cambiarFlujo(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    !noHuboPago
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  💵 Registré un pago
                </button>
                <button
                  type="button"
                  onClick={() => cambiarFlujo(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    noHuboPago
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🚫 No hubo pago
                </button>
              </div>
            </div>

            {/* ── Formulario unificado ── */}
            <form onSubmit={handleGuardar} className="px-4 md:px-6 pb-8 md:pb-6 pt-4 space-y-4">

              {!noHuboPago ? (
                /* ── FLUJO 1: pago ── */
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Monto del pago *</label>
                      <input
                        type="number" step="0.01" min="0.01" max={saldo} required
                        value={formPago.monto_pago}
                        onChange={e => setFormPago({ ...formPago, monto_pago: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                      {formPago.monto_pago && montoIngresado > 0 && (
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                          <span>
                            Comisión (12%):&nbsp;
                            <span className="font-medium text-green-600">{fmt(montoIngresado * 0.12)}</span>
                          </span>
                          <span>
                            Saldo tras abono:&nbsp;
                            <span className={`font-medium ${saldoTrasAbono === 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                              {fmt(saldoTrasAbono)}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de pago</label>
                      <select
                        value={formPago.tipo_pago}
                        onChange={e => setFormPago({ ...formPago, tipo_pago: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="abono">Abono</option>
                        <option value="liquidacion">Liquidación</option>
                        <option value="pago_extra">Pago extra</option>
                        <option value="recuperacion_enganche">Recuperación enganche</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Origen del pago</label>
                      <select
                        value={formPago.origen_pago}
                        onChange={e => setFormPago({ ...formPago, origen_pago: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="domicilio">Domicilio</option>
                        <option value="calle">Calle</option>
                        <option value="oficina">Oficina</option>
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones del pago</label>
                      <input
                        type="text"
                        value={formPago.observaciones}
                        onChange={e => setFormPago({ ...formPago, observaciones: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Opcional"
                      />
                    </div>
                  </div>

                  {/* Pago histórico — admin/supervisor */}
                  {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && (
                    <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50">
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-amber-100 transition">
                        <input
                          type="checkbox"
                          checked={pagoHistorico}
                          onChange={e => {
                            setPagoHistorico(e.target.checked)
                            if (!e.target.checked) setFechaPagoHistorico('')
                          }}
                          className="w-4 h-4 accent-amber-600"
                        />
                        <span className="text-sm font-medium text-amber-800">📅 Pago histórico (fecha personalizada)</span>
                      </label>
                      {pagoHistorico && (
                        <div className="px-4 pb-4 border-t border-amber-200">
                          <p className="text-xs text-amber-700 mt-3 mb-2">
                            Ingresa la fecha real en que se realizó el pago.
                          </p>
                          <input
                            type="date"
                            value={fechaPagoHistorico}
                            onChange={e => setFechaPagoHistorico(e.target.value)}
                            max={fechaLocalHoy()}
                            required={pagoHistorico}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Checkbox visita opcional */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition">
                      <input
                        type="checkbox"
                        checked={registrarVisitaTambien}
                        onChange={e => setRegistrarVisitaTambien(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-700">📅 Registrar visita también</span>
                    </label>
                    {registrarVisitaTambien && (
                      <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                        <p className="text-xs text-gray-400 mt-3 mb-2">
                          Se registrará una visita de tipo <strong>Visita</strong> con el comentario que escribas.
                        </p>
                        <input
                          type="text"
                          value={formVisita.comentario}
                          onChange={e => setFormVisita({ ...formVisita, comentario: e.target.value })}
                          placeholder="Comentario de la visita..."
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* ── FLUJO 2: solo visita ── */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className={formVisita.tipo_seguimiento === 'promesa_pago' ? '' : 'col-span-2'}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">¿Qué pasó?</label>
                      <select
                        value={formVisita.tipo_seguimiento}
                        onChange={e => setFormVisita({ ...formVisita, tipo_seguimiento: e.target.value, fecha_programada: '' })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        {TIPOS_SIN_PAGO.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    {formVisita.tipo_seguimiento === 'promesa_pago' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de la cita *</label>
                        <input
                          type="date"
                          value={formVisita.fecha_programada}
                          onChange={e => setFormVisita({ ...formVisita, fecha_programada: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Comentario</label>
                    <input
                      type="text"
                      value={formVisita.comentario}
                      onChange={e => setFormVisita({ ...formVisita, comentario: e.target.value })}
                      placeholder="Opcional"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Mensajes */}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {exito === '__offline__' ? (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 space-y-2">
                  <p className="text-yellow-800 text-sm font-medium">
                    📴 Guardado localmente — se enviará cuando haya conexión
                  </p>
                  {datosPago && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => generarTicket(datosPago)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-medium transition"
                      >
                        🖨️ Ver comprobante provisional
                      </button>
                      {'share' in navigator && (
                        <button
                          type="button"
                          onClick={() => compartirTicket(datosPago)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-sm font-medium transition"
                        >
                          📲 Compartir / RawBT
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : exito ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                  <p className="text-green-700 text-sm font-medium">{exito}</p>
                  {datosPago && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => generarTicket(datosPago)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-medium transition"
                      >
                        🖨️ Ver comprobante
                      </button>
                      {'share' in navigator && (
                        <button
                          type="button"
                          onClick={() => compartirTicket(datosPago)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-sm font-medium transition"
                        >
                          📲 Compartir / RawBT
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Botones */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className={`flex-1 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                    noHuboPago
                      ? 'bg-orange-500 hover:bg-orange-600'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {guardando
                    ? 'Guardando...'
                    : noHuboPago ? 'Registrar visita' : 'Registrar pago'}
                </button>
              </div>
            </form>

            {/* ── Historial de pagos ── */}
            {(() => {
              const pagosCola = cuentaSeleccionada
                ? getQueue().filter(op => !op.sincronizado && op.datos?.id_cuenta === cuentaSeleccionada.id_cuenta)
                : []
              const hayHistorial = historialPagos.length > 0 || pagosCola.length > 0
              if (!hayHistorial) return null
              return (
                <div className="px-6 pb-4 border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Últimos pagos
                    {cuentaSeleccionada?.numero_cuenta && (
                      <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        No. {cuentaSeleccionada.numero_cuenta}
                      </span>
                    )}
                  </p>
                  <div className="space-y-2">
                    {/* Pagos en cola offline */}
                    {pagosCola.map(op => (
                      <div key={op.id} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm">
                        <div>
                          <span className="font-medium text-yellow-800">{fmt(op.datos.monto_pago)}</span>
                          <span className="text-yellow-600 ml-2 text-xs">{op.datos.tipo_pago}</span>
                          <span className="ml-2 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 text-xs rounded-full font-medium">Pendiente de sincronizar</span>
                          {op.datos.observaciones && <p className="text-yellow-700 text-xs mt-0.5">{op.datos.observaciones}</p>}
                        </div>
                        <p className="text-yellow-600 text-xs">{new Date(op.timestamp).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                      </div>
                    ))}
                    {/* Pagos sincronizados */}
                    {historialPagos.map(p => {
                      const esFusion   = p.observaciones?.startsWith('Fusión:')
                      const esAnexo    = p.observaciones?.startsWith('Anexo:')
                      const esEnganche = p.observaciones === 'Enganche inicial'
                      if (esFusion) {
                        return (
                          <div key={p.id_pago} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm">
                            <div>
                              <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Anexo</span>
                              <span className="font-medium text-purple-800 ml-2">+{fmt(p.monto_pago)}</span>
                              <p className="text-purple-500 text-xs mt-0.5">{p.observaciones.replace('Fusión: cuentas anexadas ', '')}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                              <p className="text-gray-400 text-xs">Saldo: {fmt(p.saldo_nuevo)}</p>
                            </div>
                          </div>
                        )
                      }
                      if (esAnexo) {
                        const detalle = p.observaciones.replace('Anexo: ', '')
                        return (
                          <div key={p.id_pago} className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-sm">
                            <div>
                              <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">Cuenta anexada</span>
                              <span className="font-medium text-orange-800 ml-2">+{fmt(p.monto_pago)}</span>
                              <p className="text-orange-600 text-xs mt-0.5">{detalle}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                              <p className="text-gray-400 text-xs">Saldo: {fmt(p.saldo_nuevo)}</p>
                            </div>
                          </div>
                        )
                      }
                      if (esEnganche) {
                        return (
                          <div key={p.id_pago} className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm">
                            <div>
                              <span className="text-xs font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">Enganche</span>
                              <span className="font-medium text-teal-800 ml-2">{fmt(p.monto_pago)}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                              <p className="text-gray-400 text-xs">Saldo: {fmt(p.saldo_nuevo)}</p>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={p.id_pago} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-800">{fmt(p.monto_pago)}</span>
                            <span className="text-gray-400 ml-2 text-xs">{p.tipo_pago}</span>
                            {p.observaciones && <p className="text-gray-400 text-xs mt-0.5">{p.observaciones}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                            <p className="text-gray-400 text-xs">Saldo: {fmt(p.saldo_nuevo)}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* ── Historial de visitas ── */}
            {historialVisitas.length > 0 && (
              <div className="px-6 pb-6 border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Historial de visitas</p>
                <div className="space-y-2">
                  {historialVisitas.map(v => (
                    <div key={v.id_seguimiento} className="flex items-start justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                      <div className="flex items-start gap-2 flex-1">
                        <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${visitaColor[v.tipo_seguimiento]}`}>
                          {visitaLabel[v.tipo_seguimiento]}
                        </span>
                        {v.comentario && <span className="text-gray-600 text-xs">{v.comentario}</span>}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-gray-500 text-xs">{new Date(v.fecha_registro).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                        {v.fecha_programada && (
                          <p className="text-blue-500 text-xs">Cita: {new Date(v.fecha_programada).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                        )}
                        <p className="text-gray-400 text-xs">{v.usuario?.nombre}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
      {/* ──── MINI MODAL: Cambiar plan ──── */}
      {modalCambiarPlan && cuentaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-bold text-gray-800">Cambiar plan por incumplimiento</h3>
              <button onClick={() => setModalCambiarPlan(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Info del plan actual */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cliente:</span>
                  <span className="font-medium">{cuentaSeleccionada.cliente?.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Plan actual:</span>
                  <span className="font-medium text-orange-700">{LABEL_PLAN[cuentaSeleccionada.plan_actual]}</span>
                </div>
              </div>

              {/* Selector de nuevo plan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nuevo plan</label>
                <div className="space-y-2">
                  {(SIGUIENTES_PLANES[cuentaSeleccionada.plan_actual] || []).map(plan => (
                    <label key={plan} className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition ${
                      nuevoPlanSugerido === plan ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input type="radio" name="nuevo_plan" value={plan}
                        checked={nuevoPlanSugerido === plan}
                        onChange={() => setNuevoPlanSugerido(plan)}
                        className="accent-orange-500" />
                      <span className="text-sm font-medium text-gray-800">{LABEL_PLAN[plan]}</span>
                      {plan === (SIGUIENTES_PLANES[cuentaSeleccionada.plan_actual] || [])[0] && (
                        <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Sugerido</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Preview del recálculo */}
              {previewCambio && nuevoPlanSugerido && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm space-y-2">
                  <p className="font-semibold text-blue-800 text-xs uppercase tracking-wide">Resumen del cambio</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">Precio anterior</p>
                      <p className="font-bold text-gray-700">{fmt(previewCambio.precio_anterior)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Precio nuevo plan</p>
                      <p className="font-bold text-gray-700">{fmt(previewCambio.precio_nuevo)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo anterior</p>
                      <p className="font-bold text-orange-600">{fmt(previewCambio.saldo_anterior)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Nuevo saldo</p>
                      <p className={`font-bold ${previewCambio.saldo_nuevo === 0 ? 'text-green-600' : 'text-blue-700'}`}>
                        {previewCambio.saldo_nuevo === 0 ? '✅ Liquidada' : fmt(previewCambio.saldo_nuevo)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Diferencia en precio: {fmt(previewCambio.precio_nuevo - previewCambio.precio_anterior)}
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400">
                Se registrará en observaciones y se perderá el beneficio del plan anterior (beneficio_vigente = false).
              </p>

              <div className="flex gap-3">
                <button type="button" onClick={() => setModalCambiarPlan(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="button" onClick={handleCambiarPlan}
                  disabled={!nuevoPlanSugerido || guardandoPlan}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {guardandoPlan ? 'Aplicando...' : 'Confirmar cambio de plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── MINI MODAL: Fusionar cuentas ──── */}
      {modalFusion && cuentaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="text-base font-bold text-gray-800">Fusionar cuentas</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Cuenta principal: <span className="font-semibold text-purple-700">{cuentaSeleccionada.numero_cuenta || cuentaSeleccionada.folio_cuenta}</span> — Saldo: {fmt(cuentaSeleccionada.saldo_actual)}
                </p>
              </div>
              <button onClick={() => setModalFusion(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {cuentasCliente.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Este cliente no tiene otras cuentas activas para fusionar.
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Selecciona las cuentas a fusionar en la principal. Su saldo se sumará y quedarán canceladas.</p>
                  <div className="space-y-2">
                    {cuentasCliente.map(c => (
                      <label key={c.id_cuenta}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                          cuentasSecSel.includes(c.id_cuenta) ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={cuentasSecSel.includes(c.id_cuenta)}
                            onChange={() => toggleCuentaSec(c.id_cuenta)}
                            className="w-4 h-4 accent-purple-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.numero_cuenta || c.folio_cuenta}</p>
                            <p className="text-xs text-gray-400">{c.plan_actual?.replace(/_/g, ' ')} · {c.estado_cuenta}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-700">{fmt(c.saldo_actual)}</span>
                      </label>
                    ))}
                  </div>

                  {cuentasSecSel.length > 0 && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Saldo principal:</span>
                        <span>{fmt(cuentaSeleccionada.saldo_actual)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>+ Saldo a fusionar:</span>
                        <span>{fmt(cuentasCliente.filter(c => cuentasSecSel.includes(c.id_cuenta)).reduce((s, c) => s + parseFloat(c.saldo_actual), 0))}</span>
                      </div>
                      <div className="flex justify-between font-bold text-purple-700 border-t border-purple-200 mt-2 pt-2">
                        <span>Nuevo saldo total:</span>
                        <span>{fmt(parseFloat(cuentaSeleccionada.saldo_actual) + cuentasCliente.filter(c => cuentasSecSel.includes(c.id_cuenta)).reduce((s, c) => s + parseFloat(c.saldo_actual), 0))}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {errorFusion && <p className="text-red-500 text-sm">{errorFusion}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalFusion(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                {cuentasCliente.length > 0 && (
                  <button type="button" onClick={handleFusionar} disabled={guardandoFusion || cuentasSecSel.length === 0}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                    {guardandoFusion ? 'Fusionando...' : `Fusionar ${cuentasSecSel.length > 0 ? `(${cuentasSecSel.length})` : ''}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── MODAL CANCELAR CUENTA ──── */}
      {modalCancelar && cuentaSeleccionada && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b">
              <h3 className="text-base font-bold text-gray-800">Cancelar cuenta</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-semibold text-gray-700">{cuentaSeleccionada.cliente?.nombre}</span>
                {' · '}<span className="font-mono text-blue-600">{cuentaSeleccionada.numero_cuenta || cuentaSeleccionada.folio_cuenta}</span>
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                <p className="font-semibold mb-0.5">Saldo pendiente: {fmt(cuentaSeleccionada.saldo_actual)}</p>
                <p className="text-xs">El dinero cobrado hasta ahora no se devuelve. La cuenta quedará cancelada definitivamente.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de cancelación *</label>
                <select
                  value={motivoCancelacion}
                  onChange={e => setMotivoCancelacion(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <option value="">Selecciona un motivo...</option>
                  <option>No cumplió con los pagos</option>
                  <option>Cliente problemático</option>
                  <option>Cliente se arrepintió</option>
                  <option>Producto devuelto</option>
                  <option>Domicilio no localizado</option>
                  <option>Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas adicionales <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea
                  value={notasCancelacion}
                  onChange={e => setNotasCancelacion(e.target.value)}
                  placeholder="Detalles adicionales..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>

              {errorCancelacion && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{errorCancelacion}</p>
              )}
            </div>

            <div className="p-5 border-t flex justify-end gap-3">
              <button
                onClick={() => setModalCancelar(false)}
                disabled={guardandoCancelacion}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
              >
                Volver
              </button>
              <button
                onClick={handleCancelarCuenta}
                disabled={!motivoCancelacion || guardandoCancelacion}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg transition"
              >
                {guardandoCancelacion ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──── MODAL DETALLE ──── */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl h-[95svh] sm:h-auto sm:max-h-[95vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between gap-2 p-4 md:p-6 border-b sticky top-0 bg-white z-10">
              <div className="min-w-0 flex-1">
                {cargandoDetalle
                  ? <p className="text-gray-400 text-sm animate-pulse">Cargando...</p>
                  : <>
                      <h3 className="text-base font-bold text-gray-800 truncate">{cuentaDetalle?.cliente?.nombre}</h3>
                      <p className="text-gray-500 text-xs mt-0.5 truncate">
                        {cuentaDetalle?.numero_cuenta
                          ? <span className="text-blue-600 font-semibold">No. cuenta: {cuentaDetalle.numero_cuenta}</span>
                          : cuentaDetalle?.folio_cuenta}
                        {cuentaDetalle?.cliente?.numero_expediente &&
                          <span className="ml-2 text-gray-400">Exp. {cuentaDetalle.cliente.numero_expediente}</span>}
                      </p>
                    </>
                }
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!cargandoDetalle && cuentaDetalle && ['cobrador','jefe_camioneta','administrador','supervisor_cobranza'].includes(usuario?.rol) && (
                  <button
                    type="button"
                    onClick={() => { setPanelUbicDet(!panelUbicDet); setModoUbicDet('opciones'); setUbicPendDet(null); setUbicInputDet('') }}
                    className={`text-xs px-2 sm:px-3 py-1.5 rounded-lg font-medium transition min-h-[36px] ${
                      panelUbicDet ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span className="sm:hidden">📍</span>
                    <span className="hidden sm:inline">📍 {panelUbicDet ? 'Cancelar' : 'Corregir ubicación'}</span>
                  </button>
                )}
                <button onClick={cerrarDetalle} className="text-gray-400 hover:text-gray-600 text-xl shrink-0">✕</button>
              </div>
            </div>

            {datosLimitadosDetalle && (
              <div className="px-4 md:px-6 py-2 bg-amber-50 border-b border-amber-200">
                <p className="text-amber-800 text-xs font-medium">
                  📴 Sin conexión: mostrando datos guardados de la lista, sin historial de pagos reciente.
                </p>
              </div>
            )}

            {/* Panel corrección de ubicación (detalle) */}
            {panelUbicDet && cuentaDetalle && (
              <div className="px-4 md:px-6 py-4 border-b bg-blue-50">
                {exitoUbicDet && (
                  <p className="text-green-700 text-sm font-medium mb-2">{exitoUbicDet}</p>
                )}
                {modoUbicDet === 'opciones' && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-3">¿Cómo quieres corregir la ubicación?</p>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={usarGPSDetalle} disabled={buscandoGPSDet}
                        className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-4 py-3 text-left hover:bg-blue-50 transition disabled:opacity-50">
                        <span className="text-2xl">🎯</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{buscandoGPSDet ? 'Obteniendo GPS…' : 'Usar mi ubicación actual'}</p>
                          <p className="text-xs text-gray-500">Captura las coordenadas GPS de tu celular</p>
                        </div>
                      </button>
                      <button type="button" onClick={() => setModoUbicDet('manual')}
                        className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-4 py-3 text-left hover:bg-blue-50 transition">
                        <span className="text-2xl">⌨️</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">Ingresar Plus Code</p>
                          <p className="text-xs text-gray-500">Escribe manualmente el código de ubicación</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
                {modoUbicDet === 'manual' && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-2">Ingresa el Plus Code</p>
                    <div className="flex gap-2">
                      <input type="text" value={ubicInputDet} onChange={e => setUbicInputDet(e.target.value)}
                        placeholder="Ej: 76C97H6P+QF"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={usarPlusCodeManualDetalle}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        Verificar
                      </button>
                    </div>
                    <button type="button" onClick={() => setModoUbicDet('opciones')} className="mt-2 text-xs text-gray-500 hover:text-gray-700">← Volver</button>
                  </div>
                )}
                {modoUbicDet === 'confirmar' && ubicPendDet && (
                  <div>
                    <p className="text-sm font-semibold text-blue-800 mb-3">¿Guardar esta ubicación para {cuentaDetalle.cliente?.nombre}?</p>
                    <div className="bg-white border border-blue-200 rounded-xl px-4 py-3 mb-3">
                      <p className="text-xs text-gray-500 mb-1">Plus Code generado</p>
                      <p className="font-mono font-bold text-blue-700 text-base">{ubicPendDet.plus_code}</p>
                      <p className="text-xs text-gray-400 mt-1">{ubicPendDet.lat.toFixed(6)}, {ubicPendDet.lng.toFixed(6)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setModoUbicDet('opciones')}
                        className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm">Cambiar</button>
                      <button type="button" onClick={guardarUbicacionDetalle} disabled={guardandoUbicDet}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                        {guardandoUbicDet ? 'Guardando…' : 'Guardar ubicación ✅'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {cargandoDetalle ? (
              <div className="p-8 text-center text-gray-400 animate-pulse">Cargando detalle...</div>
            ) : cuentaDetalle ? (
              <>
                {/* Resumen financiero */}
                <div className="p-4 md:p-6 border-b bg-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Resumen financiero</p>
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div className="bg-white rounded-xl p-3 border border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">Precio del plan</p>
                      <p className="text-base font-bold text-gray-700">{fmt(cuentaDetalle.venta?.precio_final_total || 0)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-green-100">
                      <p className="text-xs text-gray-400 mb-1">Total pagado</p>
                      <p className="text-base font-bold text-green-600">
                        {fmt(Math.max(0, parseFloat(cuentaDetalle.venta?.precio_final_total || 0) - parseFloat(cuentaDetalle.saldo_actual || 0)))}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-blue-100">
                      <p className="text-xs text-gray-400 mb-1">Saldo restante</p>
                      <p className="text-base font-bold text-blue-700">{fmt(cuentaDetalle.saldo_actual)}</p>
                    </div>
                  </div>

                  {cuentaDetalle.venta && parseFloat(cuentaDetalle.venta.precio_original_total) > parseFloat(cuentaDetalle.venta.precio_final_total) && (
                    <p className="text-xs text-center text-green-600 font-medium mb-3">
                      Ahorro del cliente: {fmt(parseFloat(cuentaDetalle.venta.precio_original_total) - parseFloat(cuentaDetalle.venta.precio_final_total))}
                      <span className="text-gray-400 ml-1">(precio original: {fmt(cuentaDetalle.venta.precio_original_total)})</span>
                    </p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[cuentaDetalle.estado_cuenta]}`}>
                      {cuentaDetalle.estado_cuenta}
                    </span>
                    <span className="text-xs text-gray-500">Plan: <span className="font-medium text-gray-700">{cuentaDetalle.plan_actual?.replace(/_/g, ' ')}</span></span>
                    <span className="text-xs text-gray-500">Frecuencia: <span className="font-medium text-gray-700 capitalize">{(cuentaDetalle.frecuencia_pago || 'semanal').replace(/_/g, ' ')}</span></span>
                    <span className="text-xs text-gray-500">Pago requerido: <span className="font-bold text-indigo-600">{fmt(calcPagoPeriodico(cuentaDetalle).monto)}{calcPagoPeriodico(cuentaDetalle).label}</span></span>
                    {badgeCumplimiento(cuentaDetalle)}
                  </div>

                  {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && !['liquidada', 'cancelada'].includes(cuentaDetalle.estado_cuenta) && (
                    <div className="mt-3">
                      {!mostrarDescuento ? (
                        <button
                          type="button"
                          onClick={() => setMostrarDescuento(true)}
                          className="text-xs text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-medium"
                        >
                          💲 Aplicar descuento
                        </button>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-800">Aplicar descuento al saldo</p>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={cuentaDetalle.saldo_actual}
                            placeholder="Monto a descontar"
                            value={montoDescuento}
                            onChange={e => setMontoDescuento(e.target.value)}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <input
                            type="text"
                            placeholder="Motivo (obligatorio)"
                            value={motivoDescuento}
                            onChange={e => setMotivoDescuento(e.target.value)}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setMostrarDescuento(false); setMontoDescuento(''); setMotivoDescuento('') }}
                              className="flex-1 border border-gray-300 text-gray-600 py-1.5 rounded-lg text-xs"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={aplicarDescuento}
                              disabled={guardandoDescuento}
                              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            >
                              {guardandoDescuento ? 'Aplicando…' : 'Confirmar descuento'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vendedor, jefe de grupo y atraso */}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {cuentaDetalle.venta?.vendedor?.nombre && (
                      <p className="text-xs text-gray-500">Vendedor: <span className="font-medium text-gray-700">{cuentaDetalle.venta.vendedor.nombre}</span></p>
                    )}
                    {cuentaDetalle.venta?.jefe_camioneta?.nombre && (
                      <p className="text-xs text-gray-500">Jefe de grupo: <span className="font-medium text-gray-700">{cuentaDetalle.venta.jefe_camioneta.nombre}</span></p>
                    )}
                    {cuentaDetalle.semanas_atraso > 0 && (
                      <p className="text-xs font-semibold text-red-600">
                        ⚠️ {formatearAtraso(cuentaDetalle.semanas_atraso)}
                        <span className="text-red-400 font-normal ml-1">({cuentaDetalle.semanas_atraso} sem.)</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Artículos */}
                {cuentaDetalle.venta?.detalles?.length > 0 && (
                  <div className="p-4 md:p-6 border-b">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Productos</p>
                    <div className="space-y-2">
                      {cuentaDetalle.venta.detalles.map(d => (
                        <div key={d.id_detalle_venta} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">{d.producto}</p>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Cant. {d.cantidad}</p>
                            {d.precio_unitario && <p className="text-xs text-gray-500">{fmt(d.precio_unitario)} c/u</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ubicaciones */}
                <div className="p-4 md:p-6 border-b">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Ubicaciones</p>
                  <UbicacionesPanel
                    idCliente={cuentaDetalle.cliente?.id_cliente}
                    puedeEditar={['cobrador','administrador','supervisor_cobranza','jefe_camioneta'].includes(usuario?.rol)}
                  />
                </div>

                {/* Historial de pagos */}
                {historialPagosDetalle.length > 0 && (
                  <div className="p-4 md:p-6 border-b">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Historial de pagos ({historialPagosDetalle.length})
                    </p>
                    <div className="space-y-2">
                      {historialPagosDetalle.map(p => {
                        const esFusion = p.observaciones?.startsWith('Fusión:')
                        return (
                          <div key={p.id_pago} className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm ${esFusion ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'}`}>
                            <div>
                              <span className={`font-medium ${esFusion ? 'text-purple-800' : 'text-gray-800'}`}>{fmt(p.monto_pago)}</span>
                              <span className="text-gray-400 ml-2 text-xs">{p.tipo_pago?.replace(/_/g, ' ')}</span>
                              {p.observaciones && !esFusion && <p className="text-gray-400 text-xs mt-0.5">{p.observaciones}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                              <p className="text-gray-400 text-xs">Saldo: {fmt(p.saldo_nuevo)}</p>
                              {['administrador', 'supervisor_cobranza'].includes(usuario?.rol) && (
                                <button
                                  type="button"
                                  onClick={() => reimprimirTicket(p)}
                                  className="text-blue-600 hover:text-blue-800 text-xs mt-1"
                                >
                                  🖨️ Reimprimir
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Historial de visitas */}
                {historialVisitasDetalle.length > 0 && (
                  <div className="p-4 md:p-6 border-b">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      Observaciones / Visitas ({historialVisitasDetalle.length})
                    </p>
                    <div className="space-y-2">
                      {historialVisitasDetalle.map(v => (
                        <div key={v.id_seguimiento} className="flex items-start justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                          <div className="flex items-start gap-2 flex-1">
                            <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${visitaColor[v.tipo_seguimiento]}`}>
                              {visitaLabel[v.tipo_seguimiento]}
                            </span>
                            {v.comentario && <span className="text-gray-600 text-xs">{v.comentario}</span>}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-gray-500 text-xs">{new Date(v.fecha_registro).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>
                            {v.fecha_programada && <p className="text-blue-500 text-xs">Cita: {new Date(v.fecha_programada).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</p>}
                            <p className="text-gray-400 text-xs">{v.usuario?.nombre}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botón ir a registrar pago */}
                <div className="p-4 md:p-6 flex gap-3">
                  <button type="button" onClick={cerrarDetalle}
                    className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm hover:bg-gray-50 transition">
                    Cerrar
                  </button>
                  <button type="button"
                    onClick={() => { cerrarDetalle(); abrirModal(cuentaDetalle) }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold transition">
                    Registrar pago
                  </button>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-gray-500">
                📴 No se pudo cargar esta cuenta: sin conexión y sin datos guardados de ella.
              </div>
            )}

          </div>
        </div>
      )}

    </Layout>
  )
}

// ──────────────── MODO RUTA DEL MAPA ────────────────
// Vista "parada actual / siguiente" para ejecutar la ruta optimizada que se
// generó en el Mapa. No reordena ni recalcula: sigue el orden importado tal cual.
function PanelRutaMapa({
  paradas, paso, setPaso, estados, meta, fmt, enlaceMapaCliente,
  onRegistrarPago, onMarcar, verCompleta, setVerCompleta, onSalir,
}) {
  const total = paradas.length
  const resueltas = paradas.filter(c => estados[c.id_cuenta]).length
  const pagadas = paradas.filter(c => estados[c.id_cuenta] === 'pagado').length
  const pct = total > 0 ? Math.round((resueltas / total) * 100) : 0
  const idxActual = Math.min(paso, Math.max(total - 1, 0))

  const dir = (c) => [c.cliente?.colonia, c.cliente?.municipio].filter(Boolean).join(', ') || c.cliente?.direccion || '—'
  const fechaGen = meta?.generada
    ? new Date(meta.generada).toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null

  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 text-center space-y-3">
        <p className="text-gray-500">La ruta importada no coincide con ninguna de tus cuentas actuales.</p>
        <p className="text-xs text-gray-400">Genera una ruta nueva desde el Mapa y toca «📋 Usar en Cobranza».</p>
        <button onClick={onSalir} className="text-sm text-blue-600 underline">Salir del modo ruta</button>
      </div>
    )
  }

  const actual = paradas[idxActual]
  const eActual = estados[actual.id_cuenta]
  const maps = enlaceMapaCliente(actual)
  const tel = actual.cliente?.telefono

  // Ubicación aproximada: tiene coords pero sin Plus Code (pin gris en el Mapa).
  const esAproximada = (c) => {
    const u = c.cliente?.ubicaciones?.[0]
    const tieneCoords = !!(u?.latitud || c.cliente?.latitud)
    const tienePlusCode = !!(u?.plus_code || c.cliente?.plus_code)
    return tieneCoords && !tienePlusCode
  }

  const marcarYAvanzar = (id, estado) => {
    onMarcar(id, estado)
    setPaso(Math.min(idxActual + 1, total - 1))
  }

  const chipAtendida = (c) => {
    const e = estados[c.id_cuenta]
    if (e === 'pagado') return <span className="text-xs font-semibold text-green-700">✓ Pagó</span>
    if (e === 'no_pago') return <span className="text-xs font-semibold text-gray-400">✗ No pagó</span>
    return null
  }
  const chipEstadoCuenta = (c) => {
    const s = c.estado_cuenta
    const cls = s === 'activa' ? 'bg-green-100 text-green-700'
      : s === 'atraso' ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{s}</span>
  }

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-blue-800">🧭 Ruta del mapa</p>
            <p className="text-xs text-blue-600 mt-0.5">
              {total} paradas{fechaGen ? ` · generada ${fechaGen}` : ''}
              {meta?.ruta ? ` · Ruta ${meta.ruta}` : ''}
              {meta?.dia ? ` · ${LABEL_DIA_COBRANZA[meta.dia] || meta.dia}` : ''}
            </p>
          </div>
          <button onClick={onSalir} className="text-xs text-blue-700 hover:text-blue-900 underline shrink-0">Salir</button>
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-xs text-blue-700 mb-1">
            <span>{resueltas} de {total} atendidas</span>
            <span>{pagadas} pagaron</span>
          </div>
          <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {resueltas === total && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
          <p className="text-base font-bold text-green-800">🎉 Ruta terminada — {pagadas} pagaron · {total - pagadas} no</p>
          <p className="text-xs text-green-700 mt-1">Puedes seguir navegando las paradas para corregir o registrar un pago tardío.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-500 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">Parada {idxActual + 1} de {total}</span>
            {chipAtendida(actual)}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold text-gray-800">{actual.cliente?.nombre}</p>
              {actual.numero_cuenta && <p className="text-sm text-blue-600 font-mono">Cta. {actual.numero_cuenta}</p>}
              <p className="text-sm text-gray-500 mt-0.5">{dir(actual)}</p>
              {esAproximada(actual) && (
                <p className="text-xs text-amber-600 font-medium mt-0.5">⚠️ Ubicación aproximada</p>
              )}
              <div className="mt-1">{chipEstadoCuenta(actual)}</div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400">Saldo</p>
              <p className="text-xl font-bold text-gray-800">{fmt(actual.saldo_actual)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            {maps ? (
              <a href={maps} target="_blank" rel="noopener noreferrer" className="text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition">📍 Ir con Maps</a>
            ) : (
              <span className="text-center bg-gray-50 text-gray-300 py-2.5 rounded-xl text-sm">Sin ubicación</span>
            )}
            {tel ? (
              <a href={`tel:${tel}`} className="text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition">📞 Llamar</a>
            ) : (
              <span className="text-center bg-gray-50 text-gray-300 py-2.5 rounded-xl text-sm">Sin teléfono</span>
            )}
          </div>

          <button onClick={() => onRegistrarPago(actual)} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold transition">💵 Registrar pago</button>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={() => marcarYAvanzar(actual.id_cuenta, 'pagado')} className="bg-green-100 hover:bg-green-200 text-green-800 py-2.5 rounded-xl text-sm font-medium transition">✓ Pagó</button>
            <button onClick={() => marcarYAvanzar(actual.id_cuenta, 'no_pago')} className="bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition">✗ No pagó / no estaba</button>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm">
            <button onClick={() => setPaso(Math.max(idxActual - 1, 0))} disabled={idxActual === 0} className="text-gray-500 hover:text-gray-700 disabled:opacity-30">◀ Anterior</button>
            {eActual && <span className="text-xs text-gray-400">ya atendida</span>}
            <button onClick={() => setPaso(Math.min(idxActual + 1, total - 1))} disabled={idxActual === total - 1} className="text-blue-600 font-semibold hover:text-blue-800 disabled:opacity-30">Siguiente ▶</button>
          </div>
      </div>

      {/* Lista de paradas */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {verCompleta ? 'Todas las paradas' : 'Próximas paradas'}
          </p>
          <button onClick={() => setVerCompleta(!verCompleta)} className="text-xs text-blue-600 hover:underline">
            {verCompleta ? 'Ver menos' : 'Ver todas'}
          </button>
        </div>
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {paradas.map((c, i) => {
            if (!verCompleta && (i < idxActual || i > idxActual + 5)) return null
            const e = estados[c.id_cuenta]
            return (
              <button
                key={c.id_cuenta}
                onClick={() => setPaso(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition ${i === idxActual ? 'bg-blue-50' : ''}`}
              >
                <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${
                  e === 'pagado' ? 'bg-green-600 text-white'
                    : e === 'no_pago' ? 'bg-gray-300 text-white'
                    : i === idxActual ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {e === 'pagado' ? '✓' : e === 'no_pago' ? '✗' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800 truncate">
                    {c.cliente?.nombre}
                    {esAproximada(c) && <span className="text-amber-600" title="Ubicación aproximada"> ⚠️</span>}
                  </span>
                  <span className="block text-xs text-gray-400 truncate">{dir(c)}</span>
                </span>
                <span className="text-sm font-semibold text-gray-600 shrink-0">{fmt(c.saldo_actual)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
