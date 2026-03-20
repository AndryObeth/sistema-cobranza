import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'

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

export default function Visitas() {
  const { usuario } = useAuth()
  const [visitas, setVisitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const esAdmin = usuario?.rol === 'administrador'

  useEffect(() => {
    cargarVisitas()
  }, [])

  const cargarVisitas = async () => {
    try {
      const url = esAdmin
        ? '/visitas/todas-pendientes'
        : `/visitas/pendientes/${usuario.id}`
      const res = await api.get(url)
      setVisitas(res.data)
    } catch {
      console.error('Error al cargar visitas')
    } finally {
      setCargando(false)
    }
  }

  // Filtrar por cliente o cobrador
  const visitasFiltradas = visitas.filter(v => {
    const texto = busqueda.toLowerCase()
    return (
      v.cliente?.nombre.toLowerCase().includes(texto) ||
      v.usuario?.nombre.toLowerCase().includes(texto)
    )
  })

  // Agrupar por cobrador
  const porCobrador = visitasFiltradas.reduce((acc, v) => {
    const nombre = v.usuario?.nombre || 'Sin asignar'
    if (!acc[nombre]) acc[nombre] = []
    acc[nombre].push(v)
    return acc
  }, {})

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)

  const esFechaHoy = (fecha) => {
    const d = new Date(fecha)
    return d >= hoy && d < manana
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Agenda de Visitas</h2>
          <p className="text-gray-500 text-sm mt-1">{visitas.length} visitas pendientes</p>
        </div>
        <button
          onClick={cargarVisitas}
          className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
        >
          Actualizar
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por cliente o cobrador..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {cargando ? (
        <p className="text-center text-gray-500 py-12">Cargando...</p>
      ) : visitasFiltradas.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No hay visitas pendientes</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(porCobrador).map(([cobrador, items]) => (
            <div key={cobrador} className="bg-white rounded-2xl shadow overflow-hidden">
              {/* Encabezado de grupo */}
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">👤</span>
                  <p className="font-semibold text-gray-800">{cobrador}</p>
                </div>
                <span className="text-xs text-gray-500 font-medium">{items.length} visita{items.length !== 1 ? 's' : ''}</span>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Cliente</th>
                    <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Tipo</th>
                    <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Fecha programada</th>
                    <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Comentario</th>
                    <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Cuenta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(v => (
                    <tr key={v.id_seguimiento} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-800">{v.cliente?.nombre}</p>
                        <p className="text-gray-400 text-xs font-mono">{v.cliente?.numero_cuenta}</p>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${visitaColor[v.tipo_seguimiento]}`}>
                          {visitaLabel[v.tipo_seguimiento]}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {v.fecha_programada ? (
                          <span className={`text-sm font-medium ${esFechaHoy(v.fecha_programada) ? 'text-orange-600' : 'text-gray-700'}`}>
                            {esFechaHoy(v.fecha_programada) && '⚡ '}
                            {new Date(v.fecha_programada).toLocaleDateString('es-MX', {
                              weekday: 'short', day: 'numeric', month: 'short'
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        {v.comentario || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-6 py-3 text-gray-500 font-mono text-xs">
                        {v.id_cuenta ? `#${v.id_cuenta}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
