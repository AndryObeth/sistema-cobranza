import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { useAuth } from '../../context/AuthContext.jsx'

const hoyISO = () => new Date().toISOString().split('T')[0]

export default function Ventas() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'administrador'
  const esSecretaria = usuario?.rol === 'secretaria'
  const puedeAsignar = esAdmin || esSecretaria

  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mostrarLiquidadas, setMostrarLiquidadas] = useState(false)

  // Datos del modal — se cargan al abrirlo
  const [productos, setProductos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [jefesCamioneta, setJefesCamioneta] = useState([])
  const [cargandoModal, setCargandoModal] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  const [form, setForm] = useState({
    id_cliente: '',
    id_vendedor: '',
    id_jefe_camioneta: '',
    tipo_venta: 'contado',
    plan_venta: 'contado_directo',
    enganche_recibido_total: '',
    observaciones: '',
    fecha_venta: hoyISO(),
    frecuencia_pago: 'semanal',
    fecha_primer_cobro: '',
    horario_preferido: '',
    numero_cuenta: '',
  })

  const [productosSeleccionados, setProductosSeleccionados] = useState([])
  const [productoActual, setProductoActual] = useState('')
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productoDropdown, setProductoDropdown] = useState(false)
  const [productoCustomNombre, setProductoCustomNombre] = useState('')
  const [productoCustomPrecio, setProductoCustomPrecio] = useState('')
  const [calculos, setCalculos] = useState(null)

  // Campos exclusivos admin — nueva venta
  const [precioOverride, setPrecioOverride] = useState('')
  const [observacionAjuste, setObservacionAjuste] = useState('')
  const [saldoInicialOverride, setSaldoInicialOverride] = useState('')

  // Buscador de cliente en modal nueva venta
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteDropdown, setClienteDropdown] = useState(false)

  // Edición de venta existente
  const [ventaEditando, setVentaEditando] = useState(null)
  const [formEdicion, setFormEdicion] = useState({})
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  useEffect(() => { cargarDatos() }, [])
  useEffect(() => { calcularVenta() }, [form, productosSeleccionados])

  // Limpiar overrides cuando cambian productos o plan
  useEffect(() => { setPrecioOverride(''); setObservacionAjuste(''); setSaldoInicialOverride('') }, [form.tipo_venta, form.plan_venta, productosSeleccionados])

  const cargarDatos = async () => {
    const [rv, rc] = await Promise.allSettled([
      api.get('/ventas'),
      api.get('/clientes'),
    ])
    if (rv.status === 'fulfilled') setVentas(rv.value.data)
    if (rc.status === 'fulfilled') setClientes(rc.value.data)
    setCargando(false)
  }

  const cargarDatosModal = async () => {
    setCargandoModal(true)
    setErrorModal('')
    const [rp, rvend, rjefes, rcob] = await Promise.allSettled([
      api.get('/productos'),
      api.get('/usuarios?rol=vendedor'),
      api.get('/usuarios?rol=jefe_camioneta'),
      api.get('/usuarios?rol=cobrador'),
    ])
    const ok = rp.status === 'fulfilled' && rvend.status === 'fulfilled' && rjefes.status === 'fulfilled'
    if (rp.status === 'fulfilled')    setProductos(rp.value.data)
    if (rvend.status === 'fulfilled' && rcob.status === 'fulfilled') {
      const vendedoresFiltrados = rvend.value.data.filter(u => u.activo).map(u => ({ ...u, _etiqueta: 'Vendedor' }))
      const cobradoresFiltrados = rcob.value.data.filter(u => u.activo).map(u => ({ ...u, _etiqueta: 'Cobrador' }))
      setVendedores([...vendedoresFiltrados, ...cobradoresFiltrados])
    } else if (rvend.status === 'fulfilled') {
      setVendedores(rvend.value.data.filter(u => u.activo).map(u => ({ ...u, _etiqueta: 'Vendedor' })))
    }
    if (rjefes.status === 'fulfilled') setJefesCamioneta(rjefes.value.data.filter(u => u.activo))
    if (!ok) setErrorModal('Error al cargar algunos datos. Verifica tu conexión.')
    setCargandoModal(false)
  }

  const calcularVenta = () => {
    if (productosSeleccionados.length === 0) { setCalculos(null); return }

    const precio_original_total = productosSeleccionados.reduce((s, p) => s + (p.precio_original * p.cantidad), 0)

    let precio_final_total = 0
    let descuento = 0

    if (form.tipo_venta === 'contado') {
      descuento = 0.30
      precio_final_total = precio_original_total * (1 - descuento)
    } else {
      if (form.plan_venta === 'un_mes')      { descuento = 0.30; precio_final_total = precio_original_total * 0.70 }
      if (form.plan_venta === 'dos_meses')   { precio_final_total = productosSeleccionados.reduce((s, p) => s + (parseFloat(p.precio_2_meses || p.precio_original * 0.80) * p.cantidad), 0) }
      if (form.plan_venta === 'tres_meses')  { precio_final_total = productosSeleccionados.reduce((s, p) => s + (parseFloat(p.precio_3_meses || p.precio_original * 0.80) * p.cantidad), 0) }
      if (form.plan_venta === 'largo_plazo') { precio_final_total = precio_original_total }
    }

    const enganche_recibido = parseFloat(form.enganche_recibido_total) || 0
    const enganche_objetivo = form.tipo_venta === 'plazo' ? precio_original_total * 0.10 : 0
    const enganche_para_vendedor = Math.min(enganche_recibido, enganche_objetivo)
    const enganche_regado = Math.max(0, enganche_objetivo - enganche_recibido)
    const sobreenganche = Math.max(0, enganche_recibido - enganche_objetivo)
    const monto_reportado = form.tipo_venta === 'contado' ? precio_original_total * 0.50 : sobreenganche
    const utilidad_vendedor = form.tipo_venta === 'contado' ? precio_final_total - monto_reportado : 0
    const saldo_cliente = form.tipo_venta === 'plazo' ? precio_final_total - enganche_recibido : 0

    setCalculos({
      precio_original_total,
      precio_final_total,
      descuento: descuento * 100,
      enganche_objetivo,
      enganche_para_vendedor,
      enganche_regado,
      sobreenganche,
      monto_reportado,
      utilidad_vendedor,
      saldo_cliente
    })
  }

  const agregarProducto = (prod) => {
    if (!prod) return
    if (productosSeleccionados.find(p => p._key === `cat-${prod.id_producto}`)) return
    setProductosSeleccionados([...productosSeleccionados, { ...prod, _key: `cat-${prod.id_producto}`, cantidad: 1 }])
    setProductoActual('')
    setBusquedaProducto('')
    setProductoDropdown(false)
  }

  const agregarProductoCustom = () => {
    const precio = parseFloat(productoCustomPrecio)
    if (!productoCustomNombre.trim() || !precio || precio <= 0) return
    setProductosSeleccionados([...productosSeleccionados, {
      _key:           `custom-${Date.now()}`,
      _esCustom:      true,
      nombre_comercial: productoCustomNombre.trim(),
      codigo_producto: 'ESPECIAL',
      precio_original: precio,
      cantidad:        1,
    }])
    setProductoCustomNombre('')
    setProductoCustomPrecio('')
  }

  const quitarProducto = (key) => {
    setProductosSeleccionados(productosSeleccionados.filter(p => p._key !== key))
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setForm({ id_cliente: '', id_vendedor: '', id_jefe_camioneta: '', tipo_venta: 'contado', plan_venta: 'contado_directo', enganche_recibido_total: '', observaciones: '', fecha_venta: hoyISO(), frecuencia_pago: 'semanal', fecha_primer_cobro: '', horario_preferido: '', numero_cuenta: '' })
    setBusquedaCliente('')
    setClienteDropdown(false)
    setProductoCustomNombre('')
    setProductoCustomPrecio('')
    setProductosSeleccionados([])
    setCalculos(null)
    setPrecioOverride('')
    setObservacionAjuste('')
    setSaldoInicialOverride('')
    setError('')
    setErrorModal('')
  }

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (productosSeleccionados.length === 0) { setError('Agrega al menos un producto'); return }
    if (!calculos) return
    setGuardando(true)
    setError('')
    try {
      const detalles = productosSeleccionados.map(p => ({
        ...(p._esCustom ? {} : { id_producto: p.id_producto }),
        codigo_producto: p.codigo_producto || 'ESPECIAL',
        producto: p.nombre_comercial,
        cantidad: p.cantidad,
        precio_original_unitario: parseFloat(p.precio_original),
        precio_final_unitario: parseFloat(p.precio_original),
        subtotal_original: parseFloat(p.precio_original) * p.cantidad,
        subtotal_final: parseFloat(p.precio_original) * p.cantidad,
      }))

      const payload = {
        id_cliente: parseInt(form.id_cliente),
        tipo_venta: form.tipo_venta,
        plan_venta: form.plan_venta,
        precio_original_total: calculos.precio_original_total,
        precio_final_total: calculos.precio_final_total,
        enganche_recibido_total: parseFloat(form.enganche_recibido_total) || 0,
        observaciones: form.observaciones,
        fecha_venta: form.fecha_venta,
        detalles
      }

      // Asignación de vendedor (solo admin/secretaria pueden sobreescribir)
      if (puedeAsignar && form.id_vendedor) payload.id_vendedor = parseInt(form.id_vendedor)
      if (form.id_jefe_camioneta) payload.id_jefe_camioneta = parseInt(form.id_jefe_camioneta)

      if (esAdmin && precioOverride && parseFloat(precioOverride) !== calculos.precio_final_total) {
        payload.precio_final_total_override = parseFloat(precioOverride)
        payload.observacion_ajuste = observacionAjuste
      }

      if (form.tipo_venta === 'plazo') {
        payload.frecuencia_pago    = form.frecuencia_pago
        payload.fecha_primer_cobro = form.fecha_primer_cobro || null
        payload.horario_preferido  = form.horario_preferido  || null
        payload.numero_cuenta      = form.numero_cuenta       || null
        if (esAdmin && saldoInicialOverride && parseFloat(saldoInicialOverride) >= 0) {
          payload.saldo_inicial_override = parseFloat(saldoInicialOverride)
        }
      }

      await api.post('/ventas', payload)
      cerrarModal()
      cargarDatos()
    } catch {
      setError('Error al registrar venta')
    } finally {
      setGuardando(false)
    }
  }

  const abrirEdicion = (e, v) => {
    e.stopPropagation()
    setVentaEditando(v)
    setFormEdicion({
      fecha_venta:             new Date(v.fecha_venta).toISOString().split('T')[0],
      precio_final_total:      parseFloat(v.precio_final_total).toFixed(2),
      enganche_recibido_total: parseFloat(v.enganche_recibido_total || 0).toFixed(2),
      observaciones:           v.observaciones || '',
      estatus_venta:           v.estatus_venta,
      frecuencia_pago:         v.cuenta?.frecuencia_pago || 'semanal',
      numero_cuenta:           v.cuenta?.numero_cuenta || '',
    })
    setErrorEdicion('')
  }

  const handleGuardarEdicion = async (e) => {
    e.preventDefault()
    setGuardandoEdicion(true)
    setErrorEdicion('')
    try {
      const promesas = [
        api.put(`/ventas/${ventaEditando.id_venta}`, {
          fecha_venta:             formEdicion.fecha_venta,
          precio_final_total:      parseFloat(formEdicion.precio_final_total),
          enganche_recibido_total: parseFloat(formEdicion.enganche_recibido_total),
          observaciones:           formEdicion.observaciones,
          estatus_venta:           formEdicion.estatus_venta,
        })
      ]
      // Si es a plazo y tiene cuenta, actualizar frecuencia si cambió
      if (ventaEditando.tipo_venta === 'plazo' && ventaEditando.cuenta?.id_cuenta) {
        const cuentaData = {}
        if (formEdicion.frecuencia_pago !== ventaEditando.cuenta.frecuencia_pago)
          cuentaData.frecuencia_pago = formEdicion.frecuencia_pago
        if (formEdicion.numero_cuenta !== (ventaEditando.cuenta.numero_cuenta || ''))
          cuentaData.numero_cuenta = formEdicion.numero_cuenta
        if (Object.keys(cuentaData).length > 0) {
          promesas.push(api.put(`/pagos/cuenta/${ventaEditando.cuenta.id_cuenta}/frecuencia`, cuentaData))
        }
      }
      await Promise.all(promesas)
      setVentaEditando(null)
      cargarDatos()
    } catch (err) {
      setErrorEdicion(err.response?.data?.error || 'Error al actualizar venta')
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  const planOpciones = {
    contado: [{ value: 'contado_directo', label: 'Contado directo' }],
    plazo: [
      { value: 'un_mes',      label: '1 mes (4 semanas)' },
      { value: 'dos_meses',   label: '2 meses (8 semanas)' },
      { value: 'tres_meses',  label: '3 meses (12 semanas)' },
      { value: 'largo_plazo', label: 'Largo plazo (hasta 52 semanas)' },
    ]
  }

  const ventasFiltradas = ventas.filter(v => {
    // Ocultar ventas cuya cuenta fue cancelada por fusión
    if (v.cuenta?.estado_cuenta === 'cancelada' && v.cuenta?.observaciones?.startsWith('Fusionada con')) return false
    return mostrarLiquidadas ? true : v.estatus_venta !== 'liquidada'
  })

  // Precio efectivo que se usará al guardar (override o calculado)
  const precioEfectivo = esAdmin && precioOverride && parseFloat(precioOverride) > 0
    ? parseFloat(precioOverride)
    : calculos?.precio_final_total ?? 0

  const precioAjustado = esAdmin && precioOverride &&
    parseFloat(precioOverride) > 0 &&
    parseFloat(precioOverride) !== calculos?.precio_final_total

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Ventas</h2>
          <p className="text-gray-500 text-sm mt-1">
            {ventasFiltradas.length} ventas
            {!mostrarLiquidadas && ventas.filter(v => v.estatus_venta === 'liquidada').length > 0 && (
              <span className="text-gray-400"> · {ventas.filter(v => v.estatus_venta === 'liquidada').length} liquidadas ocultas</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setMostrarLiquidadas(!mostrarLiquidadas)}
              className={`relative w-10 h-6 rounded-full transition-colors ${mostrarLiquidadas ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${mostrarLiquidadas ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-600">Mostrar liquidadas</span>
          </label>
          <button onClick={() => { setModalAbierto(true); cargarDatosModal() }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            + Nueva venta
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : ventasFiltradas.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay ventas registradas</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="hidden md:table-cell text-left px-6 py-3 text-gray-600 font-medium">Cuenta</th>
                <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Cliente</th>
                <th className="hidden sm:table-cell text-left px-6 py-3 text-gray-600 font-medium">Tipo</th>
                <th className="hidden sm:table-cell text-left px-6 py-3 text-gray-600 font-medium">Plan</th>
                <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Precio</th>
                <th className="hidden md:table-cell text-left px-6 py-3 text-gray-600 font-medium">Fecha</th>
                <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Estatus</th>
                {esAdmin && <th className="px-4 md:px-6 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ventasFiltradas.map(v => {
                const liquidada = v.estatus_venta === 'liquidada'
                return (
                  <tr key={v.id_venta} className={`transition ${liquidada ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className="hidden md:table-cell px-6 py-4 font-mono text-xs">
                      {v.cuenta?.numero_cuenta
                        ? <span className="font-semibold text-gray-700">{v.cuenta.numero_cuenta}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 md:px-6 py-4 font-medium ${liquidada ? 'text-gray-400' : 'text-gray-800'}`}>{v.cliente?.nombre}</td>
                    <td className="hidden sm:table-cell px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        liquidada ? 'bg-gray-100 text-gray-400' :
                        v.tipo_venta === 'contado' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>{v.tipo_venta}</span>
                    </td>
                    <td className={`hidden sm:table-cell px-6 py-4 text-xs ${liquidada ? 'text-gray-400' : 'text-gray-600'}`}>{v.plan_venta?.replace(/_/g, ' ')}</td>
                    <td className="px-4 md:px-6 py-4">
                      {!liquidada && parseFloat(v.precio_original_total) > parseFloat(v.precio_final_total) && (
                        <p className="text-xs text-gray-400 line-through">{fmt(v.precio_original_total)}</p>
                      )}
                      <p className={`font-medium whitespace-nowrap ${liquidada ? 'text-gray-400' : 'text-gray-800'}`}>{fmt(v.precio_final_total)}</p>
                    </td>
                    <td className={`hidden md:table-cell px-6 py-4 ${liquidada ? 'text-gray-400' : 'text-gray-500'}`}>{new Date(v.fecha_venta).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}</td>
                    <td className="px-4 md:px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        v.estatus_venta === 'activa'    ? 'bg-green-100 text-green-700' :
                        v.estatus_venta === 'liquidada' ? 'bg-gray-100 text-gray-400' :
                        'bg-red-100 text-red-700'
                      }`}>{v.estatus_venta}</span>
                    </td>
                    {esAdmin && (
                      <td className="px-4 md:px-6 py-4 text-right">
                        <button onClick={e => abrirEdicion(e, v)}
                          className="text-xs px-3 min-h-[44px] md:min-h-0 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition font-medium">
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal editar venta */}
      {ventaEditando && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Editar venta</h3>
                <p className="text-xs text-gray-400 mt-0.5">{ventaEditando.cliente?.nombre} {ventaEditando.cuenta?.numero_cuenta ? `· Cta. ${ventaEditando.cuenta.numero_cuenta}` : ''}</p>
              </div>
              <button onClick={() => setVentaEditando(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="p-6 space-y-4">
              {/* Info no editable */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 grid grid-cols-2 gap-2">
                <span><strong>Tipo:</strong> {ventaEditando.tipo_venta}</span>
                <span><strong>Plan:</strong> {ventaEditando.plan_venta?.replace(/_/g, ' ')}</span>
                <span className="col-span-2"><strong>Productos:</strong> {ventaEditando.detalles?.map(d => `${d.producto} x${d.cantidad}`).join(', ')}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de venta</label>
                  <input type="date" value={formEdicion.fecha_venta}
                    onChange={e => setFormEdicion({...formEdicion, fecha_venta: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio final</label>
                  <input type="number" step="0.01" value={formEdicion.precio_final_total}
                    onChange={e => setFormEdicion({...formEdicion, precio_final_total: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {ventaEditando.cuenta && parseFloat(formEdicion.precio_final_total) !== parseFloat(ventaEditando.precio_final_total) && (
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ Actualizará el saldo de la cuenta proporcionalmente
                    </p>
                  )}
                </div>
                {ventaEditando.tipo_venta === 'plazo' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Enganche recibido</label>
                    <input type="number" step="0.01" value={formEdicion.enganche_recibido_total}
                      onChange={e => setFormEdicion({...formEdicion, enganche_recibido_total: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
                {ventaEditando.tipo_venta === 'plazo' && ventaEditando.cuenta && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia de pago</label>
                      <select value={formEdicion.frecuencia_pago}
                        onChange={e => setFormEdicion({...formEdicion, frecuencia_pago: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="semanal">Semanal</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="mensual">Mensual</option>
                        <option value="dos_meses">Cada 2 meses</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Número de cuenta
                        {!ventaEditando.cuenta.numero_cuenta && (
                          <span className="ml-1 text-amber-500 font-normal text-xs">sin asignar</span>
                        )}
                      </label>
                      <input type="text" value={formEdicion.numero_cuenta}
                        onChange={e => setFormEdicion({...formEdicion, numero_cuenta: e.target.value})}
                        placeholder="Ej. 60-D"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>
                )}
                <div className={ventaEditando.tipo_venta === 'plazo' ? 'col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estatus</label>
                  <select value={formEdicion.estatus_venta}
                    onChange={e => setFormEdicion({...formEdicion, estatus_venta: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="activa">activa</option>
                    <option value="liquidada">liquidada</option>
                    <option value="cancelada">cancelada</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                  <textarea rows={2} value={formEdicion.observaciones}
                    onChange={e => setFormEdicion({...formEdicion, observaciones: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {errorEdicion && <p className="text-red-500 text-sm">{errorEdicion}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setVentaEditando(null)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={guardandoEdicion}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nueva venta */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Nueva venta</h3>
                {cargandoModal && <p className="text-xs text-blue-500 mt-0.5">Cargando productos y usuarios...</p>}
                {errorModal && (
                  <p className="text-xs text-red-500 mt-0.5">
                    {errorModal}{' '}
                    <button onClick={cargarDatosModal} className="underline font-medium">Reintentar</button>
                  </p>
                )}
              </div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="p-6 space-y-6">

              {/* Cliente, tipo, plan y fecha */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                  <input
                    type="text"
                    placeholder="Buscar por nombre o expediente..."
                    value={busquedaCliente}
                    onFocus={() => setClienteDropdown(true)}
                    onBlur={() => setTimeout(() => setClienteDropdown(false), 150)}
                    onChange={e => {
                      setBusquedaCliente(e.target.value)
                      setForm({...form, id_cliente: ''})
                      setClienteDropdown(true)
                    }}
                    className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      form.id_cliente ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                    }`}
                  />
                  {/* Campo oculto para validación required */}
                  <input type="text" required value={form.id_cliente} onChange={() => {}} className="sr-only" />
                  {clienteDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {clientes
                        .filter(c => c.activo !== false && (
                          c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
                          c.numero_expediente?.toLowerCase().includes(busquedaCliente.toLowerCase())
                        ))
                        .slice(0, 20)
                        .map(c => (
                          <button
                            key={c.id_cliente}
                            type="button"
                            onMouseDown={() => {
                              setForm({...form, id_cliente: c.id_cliente})
                              setBusquedaCliente(`${c.nombre} — Exp. ${c.numero_expediente}`)
                              setClienteDropdown(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                          >
                            <span className="font-medium text-gray-800">{c.nombre}</span>
                            <span className="text-gray-400 text-xs ml-2">Exp. {c.numero_expediente}</span>
                          </button>
                        ))}
                      {clientes.filter(c => c.activo !== false && (
                        c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
                        c.numero_expediente?.toLowerCase().includes(busquedaCliente.toLowerCase())
                      )).length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Vendedor y jefe de grupo — visibles para admin y secretaria */}
                {puedeAsignar && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Vendedor <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <select value={form.id_vendedor}
                        onChange={e => setForm({...form, id_vendedor: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— Sin asignar —</option>
                        {vendedores.map(u => (
                          <option key={u.id_usuario} value={u.id_usuario}>{u.nombre} ({u._etiqueta})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Jefe de grupo <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <select value={form.id_jefe_camioneta}
                        onChange={e => setForm({...form, id_jefe_camioneta: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— Sin asignar —</option>
                        {jefesCamioneta.map(u => (
                          <option key={u.id_usuario} value={u.id_usuario}>{u.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de venta</label>
                  <select value={form.tipo_venta}
                    onChange={e => setForm({...form, tipo_venta: e.target.value, plan_venta: e.target.value === 'contado' ? 'contado_directo' : 'un_mes'})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="contado">Contado</option>
                    <option value="plazo">A plazos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                  <select value={form.plan_venta}
                    onChange={e => setForm({...form, plan_venta: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {planOpciones[form.tipo_venta].map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de venta</label>
                  <input
                    type="date"
                    value={form.fecha_venta}
                    onChange={e => setForm({...form, fecha_venta: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Productos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Productos</label>

                {/* Catálogo — buscador */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={busquedaProducto}
                    onChange={e => { setBusquedaProducto(e.target.value); setProductoDropdown(true) }}
                    onFocus={() => setProductoDropdown(true)}
                    onBlur={() => setTimeout(() => setProductoDropdown(false), 150)}
                    placeholder="Buscar producto del catálogo..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  {productoDropdown && (
                    <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {productos
                        .filter(p => p.nombre_comercial.toLowerCase().includes(busquedaProducto.toLowerCase()))
                        .map(p => (
                          <li key={p.id_producto}
                            onMouseDown={() => agregarProducto(p)}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between">
                            <span>{p.nombre_comercial}</span>
                            <span className="text-gray-400">{fmt(p.precio_original)}</span>
                          </li>
                        ))
                      }
                      {productos.filter(p => p.nombre_comercial.toLowerCase().includes(busquedaProducto.toLowerCase())).length === 0 && (
                        <li className="px-3 py-2 text-gray-400 text-sm">Sin resultados</li>
                      )}
                    </ul>
                  )}
                </div>

                {/* Producto especial */}
                <div className="flex gap-2 mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <input type="text" placeholder="Producto especial (nombre)"
                    value={productoCustomNombre}
                    onChange={e => setProductoCustomNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), agregarProductoCustom())}
                    className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                  <input type="number" placeholder="Precio" min="0.01" step="0.01"
                    value={productoCustomPrecio}
                    onChange={e => setProductoCustomPrecio(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), agregarProductoCustom())}
                    className="w-28 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                  <button type="button" onClick={agregarProductoCustom}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap">
                    + Especial
                  </button>
                </div>

                {productosSeleccionados.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600">Producto</th>
                          <th className="text-left px-4 py-2 text-gray-600">Precio unit.</th>
                          <th className="text-left px-4 py-2 text-gray-600">Cant.</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {productosSeleccionados.map(p => (
                          <tr key={p._key} className={p._esCustom ? 'bg-amber-50' : ''}>
                            <td className="px-4 py-2 font-medium">
                              {p.nombre_comercial}
                              {p._esCustom && <span className="ml-1 text-xs text-amber-600 font-normal">especial</span>}
                            </td>
                            <td className="px-4 py-2">
                              <input type="number" min="0.01" step="0.01"
                                value={p.precio_original}
                                onChange={e => setProductosSeleccionados(productosSeleccionados.map(x =>
                                  x._key === p._key ? {...x, precio_original: parseFloat(e.target.value) || 0} : x
                                ))}
                                className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="number" min="1" value={p.cantidad}
                                onChange={e => setProductosSeleccionados(productosSeleccionados.map(x =>
                                  x._key === p._key ? {...x, cantidad: parseInt(e.target.value) || 1} : x
                                ))}
                                className="w-16 border border-gray-300 rounded px-2 py-1 text-center text-sm" />
                            </td>
                            <td className="px-4 py-2">
                              <button type="button" onClick={() => quitarProducto(p._key)}
                                className="text-red-400 hover:text-red-600">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Enganche + datos de cobro (solo a plazos) */}
              {form.tipo_venta === 'plazo' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Enganche recibido</label>
                    <input type="number" value={form.enganche_recibido_total}
                      onChange={e => setForm({...form, enganche_recibido_total: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia de pago</label>
                      <select value={form.frecuencia_pago}
                        onChange={e => setForm({...form, frecuencia_pago: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="semanal">Semanal</option>
                        <option value="quincenal">Quincenal</option>
                        <option value="mensual">Mensual</option>
                        <option value="dos_meses">Cada 2 meses</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha sugerida primer cobro</label>
                      <input type="date" value={form.fecha_primer_cobro}
                        onChange={e => setForm({...form, fecha_primer_cobro: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Horario preferido</label>
                      <input type="text" value={form.horario_preferido}
                        onChange={e => setForm({...form, horario_preferido: e.target.value})}
                        placeholder="Ej: Mañanas, 10–12 am"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Número de cuenta <span className="text-gray-400 font-normal">(folio físico del negocio, opcional)</span>
                      </label>
                      <input type="text" value={form.numero_cuenta}
                        onChange={e => setForm({...form, numero_cuenta: e.target.value})}
                        placeholder="Ej: 001, A-045, 2024-001"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                    </div>

                    {/* Saldo inicial real — solo admin, para migración */}
                    {esAdmin && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Saldo inicial real <span className="text-gray-400 font-normal">(opcional — para migración de datos)</span>
                        </label>
                        <input type="number" step="0.01" min="0" value={saldoInicialOverride}
                          onChange={e => setSaldoInicialOverride(e.target.value)}
                          placeholder={calculos ? `${(calculos.precio_final_total - (parseFloat(form.enganche_recibido_total) || 0)).toFixed(2)} (calculado)` : '0.00'}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"/>
                        {saldoInicialOverride && calculos && parseFloat(saldoInicialOverride) !== (calculos.precio_final_total - (parseFloat(form.enganche_recibido_total) || 0)) && (
                          <p className="text-xs text-amber-700 mt-1">
                            ⚠️ Saldo personalizado. Calculado automáticamente: {fmt(calculos.precio_final_total - (parseFloat(form.enganche_recibido_total) || 0))}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Precio final — admin editable / resto solo lectura */}
              {calculos && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-gray-700">Precio final</label>
                    {esAdmin
                      ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Solo admin</span>
                      : <span className="text-xs text-gray-400">🔒 Solo admin puede modificarlo</span>
                    }
                  </div>
                  {esAdmin ? (
                    <input
                      type="number"
                      step="0.01"
                      value={precioOverride}
                      onChange={e => setPrecioOverride(e.target.value)}
                      placeholder={`${calculos.precio_final_total.toFixed(2)} (calculado)`}
                      className="w-full border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                    />
                  ) : (
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">
                      {fmt(calculos.precio_final_total)}
                    </div>
                  )}
                  {esAdmin && precioAjustado && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Motivo del ajuste de precio *</label>
                      <input
                        type="text"
                        value={observacionAjuste}
                        onChange={e => setObservacionAjuste(e.target.value)}
                        placeholder="Ej: Descuento especial, error de captura..."
                        className="w-full border border-yellow-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-yellow-50"
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Cálculos automáticos */}
              {calculos && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium text-gray-700">Resumen de la venta</p>
                    {precioAjustado && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-1 rounded-full font-medium">
                        ⚠️ Precio ajustado manualmente
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center justify-between pb-2 border-b border-gray-200">
                      <div>
                        {calculos.precio_original_total > precioEfectivo && (
                          <p className="text-sm text-gray-400 line-through">{fmt(calculos.precio_original_total)}</p>
                        )}
                        <p className={`text-2xl font-bold ${precioAjustado ? 'text-yellow-600' : 'text-blue-600'}`}>
                          {fmt(precioEfectivo)}
                        </p>
                        {precioAjustado && (
                          <p className="text-xs text-gray-400 mt-0.5">calculado: {fmt(calculos.precio_final_total)}</p>
                        )}
                      </div>
                      {calculos.precio_original_total > precioEfectivo && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full">
                          Ahorro: {fmt(calculos.precio_original_total - precioEfectivo)}&nbsp;
                          ({Math.round((calculos.precio_original_total - precioEfectivo) / calculos.precio_original_total * 100)}%)
                        </span>
                      )}
                    </div>
                    {form.tipo_venta === 'contado' && <>
                      <div className="flex justify-between"><span className="text-gray-500">Reporta al jefe:</span><span className="font-medium text-orange-600">{fmt(calculos.monto_reportado)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Utilidad vendedor:</span><span className="font-medium text-green-600">{fmt(precioEfectivo - calculos.monto_reportado)}</span></div>
                    </>}
                    {form.tipo_venta === 'plazo' && <>
                      <div className="flex justify-between"><span className="text-gray-500">Enganche objetivo:</span><span className="font-medium">{fmt(calculos.enganche_objetivo)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Enganche vendedor:</span><span className="font-medium text-green-600">{fmt(calculos.enganche_para_vendedor)}</span></div>
                      {calculos.enganche_regado > 0 && <div className="flex justify-between col-span-2"><span className="text-gray-500">Enganche regado:</span><span className="font-medium text-red-500">{fmt(calculos.enganche_regado)}</span></div>}
                      {calculos.sobreenganche > 0 && <div className="flex justify-between col-span-2"><span className="text-gray-500">Sobreenganche:</span><span className="font-medium text-purple-600">{fmt(calculos.sobreenganche)}</span></div>}
                      <div className="flex justify-between col-span-2 border-t pt-2">
                        <span className="text-gray-700 font-medium">Saldo del cliente:</span>
                        <span className="font-bold text-gray-800">{fmt(precioEfectivo - (parseFloat(form.enganche_recibido_total) || 0))}</span>
                      </div>
                    </>}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea value={form.observaciones}
                  onChange={e => setForm({...form, observaciones: e.target.value})}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={cerrarModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {guardando ? 'Registrando...' : 'Registrar venta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
