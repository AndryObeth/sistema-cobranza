import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState({
    nombre: '', alias: '', telefono: '',
    municipio: '', colonia: '', direccion: '',
    referencias: '', ruta: ''
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargarClientes()
  }, [])

  const cargarClientes = async () => {
    try {
      const res = await api.get('/clientes')
      setClientes(res.data)
    } catch {
      console.error('Error al cargar clientes')
    } finally {
      setCargando(false)
    }
  }

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.numero_cuenta.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.telefono && c.telefono.includes(busqueda))
  )

  const handleGuardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await api.post('/clientes', form)
      setModalAbierto(false)
      setForm({
        nombre: '', alias: '', telefono: '',
        municipio: '', colonia: '', direccion: '',
        referencias: '', ruta: ''
      })
      cargarClientes()
    } catch {
      setError('Error al guardar cliente')
    } finally {
      setGuardando(false)
    }
  }

  const estadoColor = {
    activo:   'bg-green-100 text-green-700',
    moroso:   'bg-red-100 text-red-700',
    bloqueado:'bg-gray-100 text-gray-700',
    inactivo: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <Layout>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
          <p className="text-gray-500 text-sm mt-1">{clientes.length} clientes registrados</p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + Nuevo cliente
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre, número de cuenta o teléfono..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay clientes registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Cuenta</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Nombre</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Teléfono</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Municipio</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Ruta</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientesFiltrados.map(c => (
                <tr key={c.id_cliente} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-mono text-gray-500">{c.numero_cuenta}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {c.nombre}
                    {c.alias && <span className="text-gray-400 font-normal ml-2">({c.alias})</span>}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{c.telefono || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{c.municipio || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{c.ruta || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[c.estado_cliente]}`}>
                      {c.estado_cliente}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo cliente */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">Nuevo cliente</h3>
              <button onClick={() => setModalAbierto(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                  <input
                    type="text" required
                    value={form.nombre}
                    onChange={e => setForm({...form, nombre: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alias</label>
                  <input
                    type="text"
                    value={form.alias}
                    onChange={e => setForm({...form, alias: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={form.telefono}
                    onChange={e => setForm({...form, telefono: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Municipio</label>
                  <input
                    type="text"
                    value={form.municipio}
                    onChange={e => setForm({...form, municipio: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Colonia</label>
                  <input
                    type="text"
                    value={form.colonia}
                    onChange={e => setForm({...form, colonia: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    value={form.direccion}
                    onChange={e => setForm({...form, direccion: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Referencias</label>
                  <input
                    type="text"
                    value={form.referencias}
                    onChange={e => setForm({...form, referencias: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ruta</label>
                  <input
                    type="text"
                    value={form.ruta}
                    onChange={e => setForm({...form, ruta: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}