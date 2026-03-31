import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'

export default function Ventas() {
  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    id_cliente: '',
    tipo_venta: 'contado',
    plan_venta: 'contado_directo',
    enganche_recibido_total: '',
    observaciones: ''
  })

  const [productosSeleccionados, setProductosSeleccionados] = useState([])
  const [productoActual, setProductoActual] = useState('')
  const [calculos, setCalculos] = useState(null)
  const [mostrarLiquidadas, setMostrarLiquidadas] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  useEffect(() => {
    calcularVenta()
  }, [form, productosSeleccionados])

  const cargarDatos = async () => {
    try {
      const [rv, rc, rp] = await Promise.all([
        api.get('/ventas'),
        api.get('/clientes'),
        api.get('/productos')
      ])
      setVentas(rv.data)
      setClientes(rc.data)
      setProductos(rp.data)
    } catch {
      console.error('Error al cargar datos')
    } finally {
      setCargando(false)
    }
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
      if (form.plan_venta === 'un_mes')     { descuento = 0.30; precio_final_total = precio_original_total * 0.70 }
      if (form.plan_venta === 'dos_meses')  { precio_final_total = productosSeleccionados.reduce((s, p) => s + (parseFloat(p.precio_2_meses || p.precio_original * 0.80) * p.cantidad), 0) }
      if (form.plan_venta === 'tres_meses') { precio_final_total = productosSeleccionados.reduce((s, p) => s + (parseFloat(p.precio_3_meses || p.precio_original * 0.80) * p.cantidad), 0) }
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

  const agregarProducto = () => {
    if (!productoActual) return
    const prod = productos.find(p => p.id_producto === parseInt(productoActual))
    if (!prod) return
    const existe = productosSeleccionados.find(p => p.id_producto === prod.id_producto)
    if (existe) return
    setProductosSeleccionados([...productosSeleccionados, { ...prod, cantidad: 1 }])
    setProductoActual('')
  }

  const quitarProducto = (id) => {
    setProductosSeleccionados(productosSeleccionados.filter(p => p.id_producto !== id))
  }

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (productosSeleccionados.length === 0) { setError('Agrega al menos un producto'); return }
    if (!calculos) return
    setGuardando(true)
    setError('')
    try {
      const detalles = productosSeleccionados.map(p => ({
        id_producto: p.id_producto,
        codigo_producto: p.codigo_producto,
        producto: p.nombre_comercial,
        cantidad: p.cantidad,
        precio_original_unitario: parseFloat(p.precio_original),
        precio_final_unitario: parseFloat(p.precio_original),
        subtotal_original: parseFloat(p.precio_original) * p.cantidad,
        subtotal_final: parseFloat(p.precio_original) * p.cantidad,
      }))

      await api.post('/ventas', {
        id_cliente: parseInt(form.id_cliente),
        tipo_venta: form.tipo_venta,
        plan_venta: form.plan_venta,
        precio_original_total: calculos.precio_original_total,
        precio_final_total: calculos.precio_final_total,
        enganche_recibido_total: parseFloat(form.enganche_recibido_total) || 0,
        observaciones: form.observaciones,
        detalles
      })

      setModalAbierto(false)
      setForm({ id_cliente: '', tipo_venta: 'contado', plan_venta: 'contado_directo', enganche_recibido_total: '', observaciones: '' })
      setProductosSeleccionados([])
      setCalculos(null)
      cargarDatos()
    } catch (err) {
      setError('Error al registrar venta')
    } finally {
      setGuardando(false)
    }
  }

  const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  const planOpciones = {
    contado: [{ value: 'contado_directo', label: 'Contado directo' }],
    plazo: [
      { value: 'un_mes',     label: '1 mes (4 semanas)' },
      { value: 'dos_meses',  label: '2 meses (8 semanas)' },
      { value: 'tres_meses', label: '3 meses (12 semanas)' },
      { value: 'largo_plazo',label: 'Largo plazo (hasta 52 semanas)' },
    ]
  }

  const ventasFiltradas = ventas.filter(v =>
    mostrarLiquidadas ? true : v.estatus_venta !== 'liquidada'
  )

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
          <button onClick={() => setModalAbierto(true)}
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Folio</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Cliente</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Tipo</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Plan</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Precio</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Fecha</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ventasFiltradas.map(v => {
                const liquidada = v.estatus_venta === 'liquidada'
                return (
                  <tr key={v.id_venta} className={`transition ${liquidada ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-6 py-4 font-mono text-gray-400 text-xs">{v.folio_venta}</td>
                    <td className={`px-6 py-4 font-medium ${liquidada ? 'text-gray-400' : 'text-gray-800'}`}>{v.cliente?.nombre}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        liquidada ? 'bg-gray-100 text-gray-400' :
                        v.tipo_venta === 'contado' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>{v.tipo_venta}</span>
                    </td>
                    <td className={`px-6 py-4 text-xs ${liquidada ? 'text-gray-400' : 'text-gray-600'}`}>{v.plan_venta?.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4">
                      {!liquidada && parseFloat(v.precio_original_total) > parseFloat(v.precio_final_total) && (
                        <p className="text-xs text-gray-400 line-through">{fmt(v.precio_original_total)}</p>
                      )}
                      <p className={`font-medium ${liquidada ? 'text-gray-400' : 'text-gray-800'}`}>{fmt(v.precio_final_total)}</p>
                    </td>
                    <td className={`px-6 py-4 ${liquidada ? 'text-gray-400' : 'text-gray-500'}`}>{new Date(v.fecha_venta).toLocaleDateString('es-MX')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        v.estatus_venta === 'activa'    ? 'bg-green-100 text-green-700' :
                        v.estatus_venta === 'liquidada' ? 'bg-gray-100 text-gray-400' :
                        'bg-red-100 text-red-700'
                      }`}>{v.estatus_venta}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nueva venta */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-bold text-gray-800">Nueva venta</h3>
              <button onClick={() => setModalAbierto(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="p-6 space-y-6">

              {/* Cliente y tipo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                  <select required value={form.id_cliente}
                    onChange={e => setForm({...form, id_cliente: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Seleccionar cliente...</option>
                    {clientes.map(c => (
                      <option key={c.id_cliente} value={c.id_cliente}>{c.nombre} — {c.numero_cuenta}</option>
                    ))}
                  </select>
                </div>
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
              </div>

              {/* Productos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Productos</label>
                <div className="flex gap-2 mb-3">
                  <select value={productoActual}
                    onChange={e => setProductoActual(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Seleccionar producto...</option>
                    {productos.map(p => (
                      <option key={p.id_producto} value={p.id_producto}>
                        {p.nombre_comercial} — {fmt(p.precio_original)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={agregarProducto}
                    className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition">
                    Agregar
                  </button>
                </div>

                {productosSeleccionados.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600">Producto</th>
                          <th className="text-left px-4 py-2 text-gray-600">Precio</th>
                          <th className="text-left px-4 py-2 text-gray-600">Cant.</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {productosSeleccionados.map(p => (
                          <tr key={p.id_producto}>
                            <td className="px-4 py-2 font-medium">{p.nombre_comercial}</td>
                            <td className="px-4 py-2 text-gray-600">{fmt(p.precio_original)}</td>
                            <td className="px-4 py-2">
                              <input type="number" min="1" value={p.cantidad}
                                onChange={e => setProductosSeleccionados(productosSeleccionados.map(x =>
                                  x.id_producto === p.id_producto ? {...x, cantidad: parseInt(e.target.value) || 1} : x
                                ))}
                                className="w-16 border border-gray-300 rounded px-2 py-1 text-center"/>
                            </td>
                            <td className="px-4 py-2">
                              <button type="button" onClick={() => quitarProducto(p.id_producto)}
                                className="text-red-400 hover:text-red-600">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Enganche (solo a plazos) */}
              {form.tipo_venta === 'plazo' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enganche recibido</label>
                  <input type="number" value={form.enganche_recibido_total}
                    onChange={e => setForm({...form, enganche_recibido_total: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"/>
                </div>
              )}

              {/* Cálculos automáticos */}
              {calculos && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <p className="font-medium text-gray-700 mb-3">Resumen de la venta</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center justify-between pb-2 border-b border-gray-200">
                      <div>
                        {calculos.precio_original_total > calculos.precio_final_total && (
                          <p className="text-sm text-gray-400 line-through">{fmt(calculos.precio_original_total)}</p>
                        )}
                        <p className="text-2xl font-bold text-blue-600">{fmt(calculos.precio_final_total)}</p>
                      </div>
                      {calculos.precio_original_total > calculos.precio_final_total && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full">
                          Ahorro: {fmt(calculos.precio_original_total - calculos.precio_final_total)}&nbsp;
                          ({Math.round((calculos.precio_original_total - calculos.precio_final_total) / calculos.precio_original_total * 100)}%)
                        </span>
                      )}
                    </div>
                    {form.tipo_venta === 'contado' && <>
                      <div className="flex justify-between"><span className="text-gray-500">Reporta al jefe:</span><span className="font-medium text-orange-600">{fmt(calculos.monto_reportado)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Utilidad vendedor:</span><span className="font-medium text-green-600">{fmt(calculos.utilidad_vendedor)}</span></div>
                    </>}
                    {form.tipo_venta === 'plazo' && <>
                      <div className="flex justify-between"><span className="text-gray-500">Enganche objetivo:</span><span className="font-medium">{fmt(calculos.enganche_objetivo)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Enganche vendedor:</span><span className="font-medium text-green-600">{fmt(calculos.enganche_para_vendedor)}</span></div>
                      {calculos.enganche_regado > 0 && <div className="flex justify-between col-span-2"><span className="text-gray-500">Enganche regado:</span><span className="font-medium text-red-500">{fmt(calculos.enganche_regado)}</span></div>}
                      {calculos.sobreenganche > 0 && <div className="flex justify-between col-span-2"><span className="text-gray-500">Sobreenganche:</span><span className="font-medium text-purple-600">{fmt(calculos.sobreenganche)}</span></div>}
                      <div className="flex justify-between col-span-2 border-t pt-2"><span className="text-gray-700 font-medium">Saldo del cliente:</span><span className="font-bold text-gray-800">{fmt(calculos.saldo_cliente)}</span></div>
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
                <button type="button" onClick={() => setModalAbierto(false)}
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