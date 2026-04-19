import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'
import { encolarPago, getQueue } from '../../utils/offlineQueue.js'
import { encodePlusCode, decodePlusCode, isValidPlusCode } from '../../utils/plusCode.js'

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

const LABEL_PLAN = {
  un_mes: '1 mes', dos_meses: '2 meses', tres_meses: '3 meses', largo_plazo: 'Largo plazo'
}

const SIGUIENTES_PLANES = {
  un_mes: ['dos_meses', 'tres_meses', 'largo_plazo'],
  dos_meses: ['tres_meses', 'largo_plazo'],
  tres_meses: ['largo_plazo'],
}

export default function Cobranza() {
  const { usuario } = useAuth()
  const location = useLocation()

  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [soloVencidas, setSoloVencidas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [ordenar, setOrdenar] = useState('cumplimiento')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroMunicipio, setFiltroMunicipio] = useState('')
  const [filtroColonia, setFiltroColonia] = useState('')
  // Modo cobranza — checklist
  const [modoCobranza, setModoCobranza]       = useState(false)
  const [visitados, setVisitados]             = useState(new Set())
  const [soloPendientes, setSoloPendientes]   = useState(false)

  const toggleVisitado = (id) => {
    setVisitados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const activarModoCobranza = () => {
    setModoCobranza(true)
    setVisitados(new Set())
    setSoloPendientes(false)
  }

  const salirModoCobranza = () => {
    setModoCobranza(false)
    setVisitados(new Set())
    setSoloPendientes(false)
  }

  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null)
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

  useEffect(() => {
    cargarCuentas()
    // Detectar filtro de vencidas desde el dashboard
    if (new URLSearchParams(location.search).get('filtro') === 'vencidas') {
      setSoloVencidas(true)
    }
  }, [])

  const cargarCuentas = async () => {
    try {
      const res = await api.get('/pagos/todas-cuentas')
      setCuentas(res.data)
    } catch {
      console.error('Error al cargar cuentas')
    } finally {
      setCargando(false)
    }
  }

  const abrirModal = async (cuenta) => {
    try {
      const [resCuenta, resVisitas] = await Promise.all([
        api.get(`/pagos/cuenta/${cuenta.id_cuenta}`),
        api.get(`/visitas/cuenta/${cuenta.id_cuenta}`)
      ])
      const detalle = resCuenta.data
      setCuentaSeleccionada(detalle)
      setHistorialPagos(detalle.pagos || [])
      setHistorialVisitas(resVisitas.data)
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
    } catch {
      console.error('Error al cargar cuenta')
    }
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setCuentaSeleccionada(null)
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

  const usarPlusCodeManualUbicacion = () => {
    const code = ubicInput.trim().toUpperCase()
    if (!isValidPlusCode(code)) { alert('Plus Code no válido. Ej: 76C97H6P+QF'); return }
    const { lat, lng } = decodePlusCode(code)
    setUbicPendiente({ lat, lng, plus_code: code })
    setModoUbicacion('confirmar')
  }

  const guardarUbicacionCliente = async () => {
    if (!ubicPendiente) return
    setGuardandoUbic(true)
    try {
      const idCliente = cuentaSeleccionada.cliente?.id_cliente
      await api.put(`/clientes/${idCliente}/coordenadas`, {
        latitud:   ubicPendiente.lat,
        longitud:  ubicPendiente.lng,
        plus_code: ubicPendiente.plus_code,
      })
      cerrarCorreccionUbicacion()
      setExito('Ubicación actualizada ✅')
      setTimeout(() => setExito(''), 4000)
    } catch {
      alert('Error al guardar la ubicación')
    } finally {
      setGuardandoUbic(false)
    }
  }

  const abrirDetalle = async (cuenta) => {
    setCargandoDetalle(true)
    setModalDetalle(true)
    try {
      const [resCuenta, resVisitas] = await Promise.all([
        api.get(`/pagos/cuenta/${cuenta.id_cuenta}`),
        api.get(`/visitas/cuenta/${cuenta.id_cuenta}`)
      ])
      setCuentaDetalle(resCuenta.data)
      setHistorialPagosDetalle(resCuenta.data.pagos || [])
      setHistorialVisitasDetalle(resVisitas.data)
    } catch {
      console.error('Error al cargar detalle')
    } finally {
      setCargandoDetalle(false)
    }
  }

  const cerrarDetalle = () => {
    setModalDetalle(false)
    setCuentaDetalle(null)
    setHistorialPagosDetalle([])
    setHistorialVisitasDetalle([])
    setPanelUbicDet(false)
    setModoUbicDet(null)
    setUbicPendDet(null)
    setUbicInputDet('')
    setExitoUbicDet('')
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
    const code = ubicInputDet.trim().toUpperCase()
    if (!isValidPlusCode(code)) { alert('Plus Code no válido. Ej: 76C97H6P+QF'); return }
    const { lat, lng } = decodePlusCode(code)
    setUbicPendDet({ lat, lng, plus_code: code })
    setModoUbicDet('confirmar')
  }

  const guardarUbicacionDetalle = async () => {
    if (!ubicPendDet) return
    setGuardandoUbicDet(true)
    try {
      const idCliente = cuentaDetalle.cliente?.id_cliente
      await api.put(`/clientes/${idCliente}/coordenadas`, {
        latitud:   ubicPendDet.lat,
        longitud:  ubicPendDet.lng,
        plus_code: ubicPendDet.plus_code,
      })
      setPanelUbicDet(false)
      setModoUbicDet(null)
      setUbicPendDet(null)
      setUbicInputDet('')
      setExitoUbicDet('Ubicación actualizada ✅')
      setTimeout(() => setExitoUbicDet(''), 4000)
    } catch {
      alert('Error al guardar la ubicación')
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

  const generarTicket = (datos) => {
    const {
      id_pago, fecha_pago, monto_pago, saldo_anterior, saldo_nuevo,
      tipo_pago, origen_pago,
      cliente_nombre, numero_expediente, numero_cuenta, folio_cuenta, plan_actual,
      cobrador_nombre,
      precio_original_total, precio_final_total
    } = datos

    const precioOrig  = parseFloat(precio_original_total || 0)
    const precioFinal = parseFloat(precio_final_total || 0)
    const ahorro      = precioOrig > precioFinal ? precioOrig - precioFinal : 0

    const fmtMXN = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    const fecha  = new Date(fecha_pago)
    const fechaStr = fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const horaStr  = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const folioPago = `TICKET-${String(id_pago).padStart(6, '0')}`
    const origenStr = { domicilio: 'Domicilio', calle: 'Calle', oficina: 'Oficina' }[origen_pago] || origen_pago
    const tipoStr   = { abono: 'Abono', liquidacion: 'Liquidación', pago_extra: 'Pago extra', recuperacion_enganche: 'Rec. enganche' }[tipo_pago] || tipo_pago

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Comprobante ${folioPago}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 6mm 4mm;
      background: #fff;
      color: #000;
    }
    .center  { text-align: center; }
    .right   { text-align: right; }
    .bold    { font-weight: bold; }
    .row     { display: flex; justify-content: space-between; margin: 2px 0; }
    .sep-sol { border-top: 1px solid #000; margin: 6px 0; }
    .sep-das { border-top: 1px dashed #666; margin: 6px 0; }
    .empresa { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .titulo  { font-size: 11px; color: #444; margin-top: 2px; }
    .folio   { font-size: 10px; color: #555; margin-top: 4px; }
    .monto-principal {
      font-size: 28px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 1px;
      margin: 8px 0 4px;
    }
    .monto-label { font-size: 10px; text-align: center; color: #555; }
    .liquidar-box {
      border: 1px dashed #000;
      padding: 4px 6px;
      margin: 6px 0;
      text-align: center;
      font-size: 11px;
    }
    .pie { font-size: 10px; text-align: center; color: #444; }
    .btn-imprimir {
      display: block;
      width: 100%;
      padding: 8px;
      margin-top: 14px;
      background: #1d4ed8;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
    }
    @media print {
      .btn-imprimir { display: none; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="empresa">NOVEDADES CANCUN</div>
    <div class="titulo">Comprobante de Pago</div>
    <div class="folio">${folioPago}</div>
    <div class="folio">${fechaStr} &nbsp; ${horaStr}</div>
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

  <div class="liquidar-box">
    Para liquidar hoy: <strong>${fmtMXN(saldo_nuevo)}</strong>
  </div>

  <div class="sep-das"></div>

  <div class="row"><span>Cobrador:</span><span>${cobrador_nombre}</span></div>
  <div class="row"><span>Origen:</span><span>${origenStr}</span></div>

  <div class="sep-sol"></div>

  <div class="pie">Conserve este comprobante</div>
  <div class="pie" style="margin-top:3px; font-size:9px;">${folioPago}</div>

  <button class="btn-imprimir" onclick="window.print()">Imprimir</button>

  <script>
    window.onload = function() { window.print(); }
  </script>
</body>
</html>`

    const ventana = window.open('', '_blank', 'width=350,height=650')
    ventana.document.write(html)
    ventana.document.close()
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

        // ── Modo offline: encolar y salir ──
        if (!navigator.onLine) {
          encolarPago({
            id_cuenta:   cuentaSeleccionada.id_cuenta,
            ...formPago,
            monto_pago:  monto,
            _meta: {
              cliente_nombre: cuentaSeleccionada.cliente?.nombre,
              folio_cuenta:   cuentaSeleccionada.folio_cuenta,
            }
          })
          setExito('__offline__')
          setFormPago(FORM_PAGO_VACIO)
          setRegistrarVisitaTambien(false)
          return
        }

        const res = await api.post('/pagos', {
          id_cuenta: cuentaSeleccionada.id_cuenta,
          ...formPago,
          monto_pago: monto,
          ...(pagoHistorico && fechaPagoHistorico && { fecha_pago: fechaPagoHistorico })
        })

        // Si checkbox activo y hay comentario, registrar visita tipo "visita"
        if (registrarVisitaTambien && formVisita.comentario.trim()) {
          await api.post('/visitas', {
            id_cliente:       cuentaSeleccionada.id_cliente,
            id_cuenta:        cuentaSeleccionada.id_cuenta,
            tipo_seguimiento: 'visita',
            comentario:       formVisita.comentario.trim()
          })
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

        if (liquidada) {
          setCuentas(prev => prev.filter(c => c.id_cuenta !== cuentaSeleccionada.id_cuenta))
          // Abrir ticket y cerrar modal
          generarTicket(ticket)
          cerrarModal()
        } else {
          setDatosPago(ticket)
          setExito(
            `Pago registrado. Saldo restante: $${parseFloat(res.data.saldo_nuevo).toLocaleString('es-MX', { minimumFractionDigits: 2 })} · ` +
            `Comisión: $${parseFloat(res.data.comision_cobrador).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
          )
          setFormPago(FORM_PAGO_VACIO)
          setFormVisita(FORM_VISITA_VACIO)
          setRegistrarVisitaTambien(false)
          cargarCuentas()
          const [actualizada, nuevasVisitas] = await Promise.all([
            api.get(`/pagos/cuenta/${cuentaSeleccionada.id_cuenta}`),
            api.get(`/visitas/cuenta/${cuentaSeleccionada.id_cuenta}`)
          ])
          setCuentaSeleccionada(actualizada.data)
          setHistorialPagos(actualizada.data.pagos || [])
          setHistorialVisitas(nuevasVisitas.data)
        }
      } else {
        // ── FLUJO 2: Solo registrar visita ──
        if (formVisita.tipo_seguimiento === 'promesa_pago' && !formVisita.fecha_programada) {
          setError('Indica la fecha de la promesa de pago')
          return
        }

        await api.post('/visitas', {
          id_cliente:       cuentaSeleccionada.id_cliente,
          id_cuenta:        cuentaSeleccionada.id_cuenta,
          tipo_seguimiento: formVisita.tipo_seguimiento,
          comentario:       formVisita.comentario || null,
          fecha_programada: formVisita.fecha_programada || null
        })

        setExito('Visita registrada correctamente')
        setFormVisita({ ...FORM_VISITA_VACIO, tipo_seguimiento: 'no_localizado' })
        const nuevasVisitas = await api.get(`/visitas/cuenta/${cuentaSeleccionada.id_cuenta}`)
        setHistorialVisitas(nuevasVisitas.data)
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
      })
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
      const res = await api.get(`/cuentas/cliente/${cuentaSeleccionada.id_cliente}`)
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
      })
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

  const abrirCambiarPlan = async () => {
    // Obtener preview del cambio desde el backend
    try {
      const res = await api.get('/cuentas/verificar-vencimientos')
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
      await api.post(`/cuentas/${cuentaSeleccionada.id_cuenta}/cambiar-plan`, { nuevo_plan: nuevoPlanSugerido })
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

  const estadoSemanas = (semanas) => {
    if (!semanas) return null
    if (semanas === 1) return <span className="text-yellow-600 text-xs">1 semana de atraso</span>
    return <span className="text-red-600 text-xs font-medium">{semanas} semanas de atraso</span>
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

  // Deduplicar municipios normalizando (ignora mayúsculas/minúsculas y acentos)
  const municipiosMap = new Map()
  cuentas.forEach(c => {
    const raw = c.cliente?.municipio
    if (!raw) return
    const key = normalizar(raw)
    if (!municipiosMap.has(key)) municipiosMap.set(key, toTitleCase(raw))
  })
  const municipiosDisponibles = [...municipiosMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))

  const coloniasMap = new Map()
  cuentas
    .filter(c => !filtroMunicipio || normalizar(c.cliente?.municipio) === filtroMunicipio)
    .forEach(c => {
      const raw = c.cliente?.colonia
      if (!raw) return
      const key = normalizar(raw)
      if (!coloniasMap.has(key)) coloniasMap.set(key, toTitleCase(raw))
    })
  const coloniasDisponibles = [...coloniasMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))

  const hayFiltros = filtroEstado || filtroMunicipio || filtroColonia || soloVencidas || ordenar !== 'cumplimiento'

  const cuentasFiltradas = cuentas
    .filter(c => {
      if (soloVencidas && !estaVencida(c)) return false
      if (filtroEstado && c.estado_cuenta !== filtroEstado) return false
      if (filtroMunicipio && normalizar(c.cliente?.municipio) !== filtroMunicipio) return false
      if (filtroColonia  && normalizar(c.cliente?.colonia)  !== filtroColonia)  return false
      const q = busqueda.toLowerCase()
      if (q) return (
        c.cliente?.nombre.toLowerCase().includes(q) ||
        c.folio_cuenta.toLowerCase().includes(q) ||
        c.numero_cuenta?.toLowerCase().includes(q) ||
        c.cliente?.numero_expediente?.toLowerCase().includes(q) ||
        c.cliente?.municipio?.toLowerCase().includes(q) ||
        c.cliente?.colonia?.toLowerCase().includes(q)
      )
      return true
    })
    .sort((a, b) => {
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
        default:            return prioridadCumplimiento(a) - prioridadCumplimiento(b)
      }
    })
    .filter(c => !modoCobranza || !soloPendientes || !visitados.has(c.id_cuenta))

  const totalVencidas    = cuentas.filter(estaVencida).length
  const totalVisitados   = modoCobranza ? [...visitados].filter(id => cuentasFiltradas.find(c => c.id_cuenta === id) || visitados.has(id)).length : 0
  const pendientesModo   = modoCobranza ? cuentasFiltradas.filter(c => !visitados.has(c.id_cuenta)).length : 0

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
        </div>
      </div>

      {/* Barra de progreso — modo cobranza */}
      {modoCobranza && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
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
          {visitados.size > 0 && (
            <button
              onClick={() => setVisitados(new Set())}
              className="mt-2 text-xs text-green-600 hover:text-green-800"
            >
              Reiniciar checklist
            </button>
          )}
        </div>
      )}

      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Buscar por cliente, folio, municipio..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-2 items-center">
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

          {hayFiltros && (
            <button
              onClick={() => { setOrdenar('cumplimiento'); setFiltroEstado(''); setFiltroMunicipio(''); setFiltroColonia(''); setSoloVencidas(false) }}
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

      {/* Cards — móvil */}
      <div className="sm:hidden space-y-3">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : cuentasFiltradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay cuentas activas</p>
        ) : cuentasFiltradas.map(c => {
          const esVisitado = visitados.has(c.id_cuenta)
          return (
            <div
              key={c.id_cuenta}
              className={`rounded-2xl shadow p-4 transition-all ${
                esVisitado ? 'bg-green-50 border border-green-200' : 'bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {modoCobranza && (
                      <button
                        onClick={() => toggleVisitado(c.id_cuenta)}
                        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                          esVisitado
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {esVisitado && <span className="text-xs font-bold">✓</span>}
                      </button>
                    )}
                    <div className="min-w-0">
                      <p className={`font-semibold truncate ${esVisitado ? 'text-green-800' : 'text-gray-800'}`}>
                        {c.cliente?.nombre}
                      </p>
                      {c.numero_cuenta
                        ? <p className="text-blue-600 text-xs font-mono font-semibold">Cta. {c.numero_cuenta}</p>
                        : <p className="text-gray-400 text-xs font-mono">{c.folio_cuenta}</p>
                      }
                      {estadoSemanas(c.semanas_atraso)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
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
                <button
                  onClick={() => abrirDetalle(c)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-semibold transition"
                >
                  Ver detalle
                </button>
                {!modoCobranza && (
                  <button
                    onClick={() => abrirModal(c)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-semibold transition"
                  >
                    Registrar pago
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla — desktop */}
      <div className="hidden sm:block bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : cuentasFiltradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay cuentas activas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {modoCobranza && <th className="px-4 py-3 w-10"></th>}
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
                    <td className="px-6 py-4">
                      <p className={`font-medium ${esVisitado ? 'text-green-800' : 'text-gray-800'}`}>{c.cliente?.nombre}</p>
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
                        ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX')
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
                        )}
                        <button
                          onClick={() => abrirDetalle(c)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
                        >
                          Ver detalle
                        </button>
                        {!modoCobranza && (
                          <button
                            onClick={() => abrirModal(c)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                          >
                            Registrar pago
                          </button>
                        )}
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

      {/* ──────────────── MODAL ──────────────── */}
      {modalAbierto && cuentaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl h-[95vh] sm:h-auto sm:max-h-[95vh] overflow-y-auto">

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
                      Venció el {new Date(cuentaSeleccionada.fecha_limite).toLocaleDateString('es-MX')} —
                      Plan actual: {LABEL_PLAN[cuentaSeleccionada.plan_actual]}
                    </p>
                  </div>
                  {usuario?.rol === 'administrador' && (
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

              {/* Fusionar cuentas (solo admin) */}
              {usuario?.rol === 'administrador' && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={abrirFusion}
                    className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1.5 rounded-lg font-medium active:bg-purple-100"
                  >
                    Fusionar cuentas
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
                        ? new Date(cuentaSeleccionada.fecha_primer_cobro).toLocaleDateString('es-MX')
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

                  {/* Pago histórico — solo administrador */}
                  {usuario?.rol === 'administrador' && (
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
                            max={new Date().toISOString().split('T')[0]}
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
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                  <p className="text-yellow-800 text-sm font-medium">
                    📴 Guardado localmente — se enviará cuando haya conexión
                  </p>
                </div>
              ) : exito ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                  <p className="text-green-700 text-sm font-medium">{exito}</p>
                  {datosPago && (
                    <button
                      type="button"
                      onClick={() => generarTicket(datosPago)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-medium transition"
                    >
                      🖨️ Ver comprobante
                    </button>
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
                        </div>
                        <p className="text-yellow-600 text-xs">{new Date(op.timestamp).toLocaleDateString('es-MX')}</p>
                      </div>
                    ))}
                    {/* Pagos sincronizados */}
                    {historialPagos.map(p => {
                      const esFusion = p.observaciones?.startsWith('Fusión:')
                      if (esFusion) {
                        return (
                          <div key={p.id_pago} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm">
                            <div>
                              <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Anexo</span>
                              <span className="font-medium text-purple-800 ml-2">+{fmt(p.monto_pago)}</span>
                              <p className="text-purple-500 text-xs mt-0.5">{p.observaciones.replace('Fusión: cuentas anexadas ', '')}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX')}</p>
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
                          </div>
                          <div className="text-right">
                            <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX')}</p>
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
                        <p className="text-gray-500 text-xs">{new Date(v.fecha_registro).toLocaleDateString('es-MX')}</p>
                        {v.fecha_programada && (
                          <p className="text-blue-500 text-xs">Cita: {new Date(v.fecha_programada).toLocaleDateString('es-MX')}</p>
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

      {/* ──── MODAL DETALLE ──── */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl h-[95vh] sm:h-auto sm:max-h-[95vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b sticky top-0 bg-white z-10">
              <div>
                {cargandoDetalle
                  ? <p className="text-gray-400 text-sm animate-pulse">Cargando...</p>
                  : <>
                      <h3 className="text-lg font-bold text-gray-800">{cuentaDetalle?.cliente?.nombre}</h3>
                      <p className="text-gray-500 text-sm">
                        {cuentaDetalle?.numero_cuenta
                          ? <span className="text-blue-600 font-semibold">No. cuenta: {cuentaDetalle.numero_cuenta}</span>
                          : cuentaDetalle?.folio_cuenta}
                        {cuentaDetalle?.cliente?.numero_expediente &&
                          <span className="ml-2 text-gray-400 text-xs">Exp. {cuentaDetalle.cliente.numero_expediente}</span>}
                      </p>
                    </>
                }
              </div>
              <div className="flex items-center gap-2">
                {!cargandoDetalle && cuentaDetalle && ['cobrador','jefe_camioneta','administrador'].includes(usuario?.rol) && (
                  <button
                    type="button"
                    onClick={() => { setPanelUbicDet(!panelUbicDet); setModoUbicDet('opciones'); setUbicPendDet(null); setUbicInputDet('') }}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition min-h-[36px] ${
                      panelUbicDet ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    📍 {panelUbicDet ? 'Cancelar' : 'Corregir ubicación'}
                  </button>
                )}
                <button onClick={cerrarDetalle} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>

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
                    {badgeCumplimiento(cuentaDetalle)}
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
                              <p className="text-gray-500 text-xs">{new Date(p.fecha_pago).toLocaleDateString('es-MX')}</p>
                              <p className="text-gray-400 text-xs">Saldo: {fmt(p.saldo_nuevo)}</p>
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
                            <p className="text-gray-500 text-xs">{new Date(v.fecha_registro).toLocaleDateString('es-MX')}</p>
                            {v.fecha_programada && <p className="text-blue-500 text-xs">Cita: {new Date(v.fecha_programada).toLocaleDateString('es-MX')}</p>}
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
            ) : null}

          </div>
        </div>
      )}

    </Layout>
  )
}
