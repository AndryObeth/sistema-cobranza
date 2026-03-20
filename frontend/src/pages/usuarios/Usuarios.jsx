import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'

const ROLES = ['administrador', 'secretaria', 'vendedor', 'cobrador']

const rolColor = {
  administrador: 'bg-purple-100 text-purple-700',
  secretaria:    'bg-blue-100 text-blue-700',
  vendedor:      'bg-green-100 text-green-700',
  cobrador:      'bg-orange-100 text-orange-700',
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState({
    nombre: '', usuario: '', contrasena: '', rol: 'vendedor', ruta_asignada: ''
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargarUsuarios()
  }, [])

  const cargarUsuarios = async () => {
    try {
      const res = await api.get('/usuarios')
      setUsuarios(res.data)
    } catch {
      console.error('Error al cargar usuarios')
    } finally {
      setCargando(false)
    }
  }

  const usuariosFiltrados = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.usuario.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.rol.toLowerCase().includes(busqueda.toLowerCase())
  )

  const handleGuardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await api.post('/usuarios', form)
      setModalAbierto(false)
      setForm({ nombre: '', usuario: '', contrasena: '', rol: 'vendedor', ruta_asignada: '' })
      cargarUsuarios()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar usuario')
    } finally {
      setGuardando(false)
    }
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setError('')
    setForm({ nombre: '', usuario: '', contrasena: '', rol: 'vendedor', ruta_asignada: '' })
  }

  return (
    <Layout>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Usuarios</h2>
          <p className="text-gray-500 text-sm mt-1">{usuarios.length} usuarios registrados</p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          + Nuevo usuario
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre, usuario o rol..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : usuariosFiltrados.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay usuarios registrados</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Nombre</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Usuario</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Rol</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Ruta asignada</th>
                <th className="text-left px-6 py-3 text-gray-600 font-medium">Fecha registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuariosFiltrados.map(u => (
                <tr key={u.id_usuario} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-medium text-gray-800">{u.nombre}</td>
                  <td className="px-6 py-4 font-mono text-gray-500">{u.usuario}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${rolColor[u.rol]}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{u.ruta_asignada || '—'}</td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(u.fecha_creacion).toLocaleDateString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo usuario */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">Nuevo usuario</h3>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input
                  type="text" required
                  value={form.nombre}
                  onChange={e => setForm({ ...form, nombre: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario (login) *</label>
                <input
                  type="text" required
                  value={form.usuario}
                  onChange={e => setForm({ ...form, usuario: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                <input
                  type="password" required
                  value={form.contrasena}
                  onChange={e => setForm({ ...form, contrasena: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                <select
                  required
                  value={form.rol}
                  onChange={e => setForm({ ...form, rol: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruta asignada</label>
                <input
                  type="text"
                  value={form.ruta_asignada}
                  onChange={e => setForm({ ...form, ruta_asignada: e.target.value })}
                  placeholder="Ej: Ruta Norte, Cancún Centro..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
