import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'
import { encolarPago, getQueue } from '../../utils/offlineQueue.js'

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
      cliente_nombre, numero_cuenta, folio_cuenta, plan_actual,
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
  <div class="row"><span>No. cuenta:</span><span>${numero_cuenta}</span></div>
  <div class="row"><span>Folio cuenta:</span><span>${folio_cuenta}</span></div>
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
          monto_pago: monto
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
          numero_cuenta:   cuentaSeleccionada.cliente?.numero_cuenta,
          folio_cuenta:    cuentaSeleccionada.folio_cuenta,
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

  const cuentasFiltradas = cuentas.filter(c => {
    if (soloVencidas && !estaVencida(c)) return false
    return (
      c.cliente?.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.folio_cuenta.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.cliente?.numero_cuenta.toLowerCase().includes(busqueda.toLowerCase())
    )
  })

  const totalVencidas = cuentas.filter(estaVencida).length

  const saldo          = parseFloat(cuentaSeleccionada?.saldo_actual || 0)
  const montoIngresado = parseFloat(formPago.monto_pago || 0)
  const saldoTrasAbono = isNaN(montoIngresado) ? saldo : Math.max(0, saldo - montoIngresado)

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
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
        {totalVencidas > 0 && (
          <button
            onClick={() => setSoloVencidas(!soloVencidas)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition border ${
              soloVencidas
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100'
            }`}
          >
            {soloVencidas ? '⚠️ Mostrando vencidas' : '⚠️ Ver solo vencidas'}
          </button>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por cliente, folio o número de cuenta..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : cuentasFiltradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay cuentas activas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Cliente</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Folio</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Plan</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Frecuencia</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Saldo</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Último pago</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cuentasFiltradas.map(c => (
                <tr key={c.id_cuenta} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-800">{c.cliente?.nombre}</p>
                    {estadoSemanas(c.semanas_atraso)}
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-500 text-xs">{c.folio_cuenta}</td>
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
                  <td className="px-6 py-4 font-bold text-gray-800">{fmt(c.saldo_actual)}</td>
                  <td className="px-6 py-4 text-gray-500">
                    {c.fecha_ultimo_pago
                      ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX')
                      : 'Sin pagos'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[c.estado_cuenta]}`}>
                      {c.estado_cuenta}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => abrirModal(c)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition"
                    >
                      Registrar pago
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ──────────────── MODAL ──────────────── */}
      {modalAbierto && cuentaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl h-[95vh] sm:h-auto sm:max-h-[95vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{cuentaSeleccionada.cliente?.nombre}</h3>
                <p className="text-gray-500 text-sm">{cuentaSeleccionada.folio_cuenta}</p>
              </div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Info de la cuenta */}
            <div className="p-6 border-b bg-gray-50">
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
                    <button
                      type="button"
                      onClick={abrirCambiarPlan}
                      className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                    >
                      Cambiar plan
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Saldo restante</p>
                  <p className="text-2xl font-bold text-gray-800">{fmt(cuentaSeleccionada.saldo_actual)}</p>
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
            <div className="px-6 py-4 border-b">
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
            <div className="px-6 pt-5 pb-2">
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
            <form onSubmit={handleGuardar} className="px-6 pb-6 pt-4 space-y-4">

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
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <p className="text-sm font-semibold text-gray-700 mb-3">Últimos pagos</p>
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
                    {historialPagos.map(p => (
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
                    ))}
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

    </Layout>
  )
}
