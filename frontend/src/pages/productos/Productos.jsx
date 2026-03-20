import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    codigo_producto: '', categoria: '', nombre_comercial: '',
    nombre_interno: '', marca: '', precio_original: '',
    aplica_2_meses: false, pago_semanal_2_meses: '', precio_2_meses: '',
    aplica_3_meses: false, pago_semanal_3_meses: '', precio_3_meses: '',
    abono_semanal_largo: '', notas: ''
  })

  useEffect(() => { cargarProductos() }, [])

  const cargarProductos = async () => {
    try {
      const res = await api.get('/productos')
      setProductos(res.data)
    } catch {
      console.error('Error al cargar productos')
    } finally {
      setCargando(false)
    }
  }

  const productosFiltrados = productos.filter(p =>
    p.nombre_comercial.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo_producto.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.categoria && p.categoria.toLowerCase().includes(busqueda.toLowerCase()))
  )

  const handleGuardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const data = {
        ...form,
        precio_original: parseFloat(form.precio_original),
        precio_2_meses: form.precio_2_meses ? parseFloat(form.precio_2_meses) : null,
        pago_semanal_2_meses: form.pago_semanal_2_meses ? parseFloat(form.pago_semanal_2_meses) : null,
        precio_3_meses: form.precio_3_meses ? parseFloat(form.precio_3_meses) : null,
        pago_semanal_3_meses: form.pago_semanal_3_meses ? parseFloat(form.pago_semanal_3_meses) : null,
        abono_semanal_largo: form.abono_semanal_largo ? parseFloat(form.abono_semanal_largo) : null,
      }
      await api.post('/productos', data)
      setModalAbierto(false)
      setForm({
        codigo_producto: '', categoria: '', nombre_comercial: '',
        nombre_interno: '', marca: '', precio_original: '',
        aplica_2_meses: false, pago_semanal_2_meses: '', precio_2_meses: '',
        aplica_3_meses: false, pago_semanal_3_meses: '', precio_3_meses: '',
        abono_semanal_largo: '', notas: ''
      })
      cargarProductos()
    } catch (err) {
      setError('Error al guardar producto')
    } finally {
      setGuardando(false)
    }
  }

  const fmt = (n) => n ? `$${parseFloat(n).toLocaleString('es-MX')}` : '—'

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Productos</h2>
          <p className="text-gray-500 text-sm mt-1">{productos.length} productos en catálogo</p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + Nuevo producto
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre, código o categoría..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : productosFiltrados.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay productos registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Código</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Nombre</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Categoría</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Precio original</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">2 meses</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">3 meses</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productosFiltrados.map(p => (
                <tr key={p.id_producto} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-mono text-gray-500">{p.codigo_producto}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {p.nombre_comercial}
                    {p.marca && <span className="text-gray-400 font-normal ml-2">{p.marca}</span>}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{p.categoria || '—'}</td>
                  <td className="px-6 py-4 text-gray-800 font-medium">{fmt(p.precio_original)}</td>
                  <td className="px-6 py-4">
                    {p.aplica_2_meses
                      ? <span className="text-green-600">{fmt(p.pago_semanal_2_meses)}/sem</span>
                      : <span className="text-gray-400">No aplica</span>}
                  </td>
                  <td className="px-6 py-4">
                    {p.aplica_3_meses
                      ? <span className="text-green-600">{fmt(p.pago_semanal_3_meses)}/sem</span>
                      : <span className="text-gray-400">No aplica</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.estatus === 'activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{p.estatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">Nuevo producto</h3>
              <button onClick={() => setModalAbierto(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                  <input type="text" required value={form.codigo_producto}
                    onChange={e => setForm({...form, codigo_producto: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <input type="text" value={form.categoria}
                    onChange={e => setForm({...form, categoria: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre comercial *</label>
                  <input type="text" required value={form.nombre_comercial}
                    onChange={e => setForm({...form, nombre_comercial: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                  <input type="text" value={form.marca}
                    onChange={e => setForm({...form, marca: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio original *</label>
                  <input type="number" required value={form.precio_original}
                    onChange={e => setForm({...form, precio_original: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>

                {/* 2 meses */}
                <div className="col-span-2 border-t pt-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <input type="checkbox" checked={form.aplica_2_meses}
                      onChange={e => setForm({...form, aplica_2_meses: e.target.checked})}
                      className="rounded"/>
                    Aplica plan 2 meses
                  </label>
                  {form.aplica_2_meses && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Precio total 2 meses</label>
                        <input type="number" value={form.precio_2_meses}
                          onChange={e => setForm({...form, precio_2_meses: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Pago semanal</label>
                        <input type="number" value={form.pago_semanal_2_meses}
                          onChange={e => setForm({...form, pago_semanal_2_meses: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3 meses */}
                <div className="col-span-2 border-t pt-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                    <input type="checkbox" checked={form.aplica_3_meses}
                      onChange={e => setForm({...form, aplica_3_meses: e.target.checked})}
                      className="rounded"/>
                    Aplica plan 3 meses
                  </label>
                  {form.aplica_3_meses && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Precio total 3 meses</label>
                        <input type="number" value={form.precio_3_meses}
                          onChange={e => setForm({...form, precio_3_meses: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Pago semanal</label>
                        <input type="number" value={form.pago_semanal_3_meses}
                          onChange={e => setForm({...form, pago_semanal_3_meses: e.target.value})}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                      </div>
                    </div>
                  )}
                </div>

                <div className="col-span-2 border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Abono semanal largo plazo</label>
                  <input type="number" value={form.abono_semanal_largo}
                    onChange={e => setForm({...form, abono_semanal_largo: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea value={form.notas}
                    onChange={e => setForm({...form, notas: e.target.value})}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalAbierto(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Guardar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}