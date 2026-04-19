import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'

const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

export default function Dashboard() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(true)

  // Consulta de cobros por fecha
  const [verConsulta, setVerConsulta]         = useState(false)
  const [fechaConsulta, setFechaConsulta]     = useState(new Date().toISOString().split('T')[0])
  const [consultando, setConsultando]         = useState(false)
  const [resultadoConsulta, setResultadoConsulta] = useState(null)
  const [verDetallePagos, setVerDetallePagos] = useState(false)

  const consultarPorFecha = async () => {
    setConsultando(true)
    setResultadoConsulta(null)
    setVerDetallePagos(false)
    try {
      const res = await api.get(`/pagos/por-fecha?fecha=${fechaConsulta}`)
      setResultadoConsulta(res.data)
    } catch {
      setResultadoConsulta({ error: 'No se pudo obtener la información' })
    } finally {
      setConsultando(false)
    }
  }

  useEffect(() => {
    api.get('/dashboard/resumen')
      .then(res => setResumen(res.data))
      .catch(() => console.error('Error al cargar resumen'))
      .finally(() => setCargando(false))
  }, [])

  const fila1 = [
    {
      label: 'Clientes activos',
      valor: cargando ? '…' : resumen?.total_clientes_activos ?? '—',
      sub:   null,
      color: 'bg-blue-500',
      texto: 'text-blue-600'
    },
    {
      label: 'Ventas hoy',
      valor: cargando ? '…' : resumen?.total_ventas_hoy ?? '—',
      sub:   cargando ? null : resumen ? fmt(resumen.monto_ventas_hoy) : null,
      color: 'bg-green-500',
      texto: 'text-green-600'
    },
    {
      label: 'Cobrado hoy',
      valor: cargando ? '…' : resumen ? fmt(resumen.total_cobrado_hoy) : '—',
      sub:   cargando ? null : resumen ? `${resumen.pagos_hoy} pagos` : null,
      color: 'bg-yellow-500',
      texto: 'text-yellow-600'
    },
    {
      label: 'Clientes morosos',
      valor: cargando ? '…' : resumen?.clientes_morosos ?? '—',
      sub:   null,
      color: 'bg-red-500',
      texto: 'text-red-600'
    },
  ]

  const fila2 = [
    {
      label: 'Cuentas activas',
      valor: cargando ? '…' : resumen?.cuentas_activas ?? '—',
      sub:   'activa o atraso',
      color: 'bg-indigo-500',
      texto: 'text-indigo-600'
    },
    {
      label: 'Cuentas en atraso',
      valor: cargando ? '…' : resumen?.cuentas_en_atraso ?? '—',
      sub:   null,
      color: 'bg-orange-500',
      texto: 'text-orange-600'
    },
    {
      label: 'Morosos',
      valor: cargando ? '…' : resumen?.clientes_morosos ?? '—',
      sub:   '>4 semanas sin pago',
      color: 'bg-rose-500',
      texto: 'text-rose-600'
    },
    {
      label: 'Monto cobrado hoy',
      valor: cargando ? '…' : resumen ? fmt(resumen.total_cobrado_hoy) : '—',
      sub:   cargando ? null : resumen ? `en ${resumen.pagos_hoy} visitas` : null,
      color: 'bg-teal-500',
      texto: 'text-teal-600'
    },
  ]

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">
          Bienvenido, {usuario?.nombre} 👋
        </h2>
        <p className="text-gray-500 mt-1 text-sm">
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Fila 1 — métricas principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-6">
        {fila1.map(card => (
          <div key={card.label} className="bg-white rounded-xl md:rounded-2xl shadow p-4 md:p-6">
            <div className={`w-8 h-8 md:w-10 md:h-10 ${card.color} rounded-lg md:rounded-xl mb-3 md:mb-4`} />
            <p className="text-gray-500 text-xs md:text-sm">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${cargando ? 'text-gray-300 animate-pulse' : 'text-gray-800'}`}>
              {card.valor}
            </p>
            {card.sub && (
              <p className={`text-xs mt-1 ${card.texto}`}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Fila 2 — métricas de cartera */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cartera</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {fila2.map(card => (
          <div key={card.label} className="bg-white rounded-xl md:rounded-2xl shadow p-4 md:p-6">
            <div className={`w-8 h-8 md:w-10 md:h-10 ${card.color} rounded-lg md:rounded-xl mb-3 md:mb-4`} />
            <p className="text-gray-500 text-xs md:text-sm">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-bold mt-1 ${cargando ? 'text-gray-300 animate-pulse' : 'text-gray-800'}`}>
              {card.valor}
            </p>
            {card.sub && (
              <p className={`text-xs mt-1 ${card.texto}`}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Tarjetas de atención requerida */}
      {!cargando && (resumen?.planes_vencidos > 0 || resumen?.clientes_sin_ubicacion > 0) && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Atención requerida</p>
          <div className="flex flex-col md:flex-row gap-3">
            {resumen?.planes_vencidos > 0 && (
              <button
                onClick={() => navigate('/cobranza?filtro=vencidas')}
                className="flex-1 text-left bg-orange-50 border-2 border-orange-300 rounded-2xl p-6 hover:bg-orange-100 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-400 rounded-xl flex items-center justify-center text-white text-xl">⚠️</div>
                  <div>
                    <p className="text-orange-700 text-sm font-medium">Planes vencidos por incumplimiento</p>
                    <p className="text-3xl font-bold text-orange-600 mt-0.5">{resumen.planes_vencidos}</p>
                    <p className="text-xs text-orange-500 mt-1">Cuentas que superaron su fecha límite</p>
                  </div>
                </div>
              </button>
            )}
            {resumen?.clientes_sin_ubicacion > 0 && (
              <button
                onClick={() => navigate('/mapa?filtro=sin_ubicacion')}
                className="flex-1 text-left bg-gray-50 border-2 border-gray-300 rounded-2xl p-6 hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-400 rounded-xl flex items-center justify-center text-white text-xl">📍</div>
                  <div>
                    <p className="text-gray-700 text-sm font-medium">Clientes sin ubicación</p>
                    <p className="text-3xl font-bold text-gray-600 mt-0.5">{resumen.clientes_sin_ubicacion}</p>
                    <p className="text-xs text-gray-500 mt-1">Sin coordenadas GPS — Click para corregir en mapa</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
      {/* Consulta de cobros por fecha */}
      {['administrador', 'supervisor_cobranza', 'secretaria'].includes(usuario?.rol) && (
        <div className="mt-6 bg-white rounded-2xl shadow overflow-hidden">
          <button
            onClick={() => setVerConsulta(!verConsulta)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
          >
            <span className="font-semibold text-gray-700 text-sm">Consultar cobros por fecha</span>
            <span className="text-gray-400 text-xs">{verConsulta ? '▲ ocultar' : '▼ ver'}</span>
          </button>

          {verConsulta && (
            <div className="px-5 pb-5 border-t pt-4">
              <div className="flex gap-2 mb-4">
                <input
                  type="date"
                  value={fechaConsulta}
                  onChange={e => { setFechaConsulta(e.target.value); setResultadoConsulta(null) }}
                  max={new Date().toISOString().split('T')[0]}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={consultarPorFecha}
                  disabled={consultando}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {consultando ? 'Consultando...' : 'Consultar'}
                </button>
              </div>

              {resultadoConsulta?.error && (
                <p className="text-red-500 text-sm">{resultadoConsulta.error}</p>
              )}

              {resultadoConsulta && !resultadoConsulta.error && (
                <div className="space-y-4">
                  {/* Resumen del día */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-teal-600 mb-1">Total cobrado</p>
                      <p className="text-2xl font-bold text-teal-700">{fmt(resultadoConsulta.total)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                      <p className="text-xs text-blue-600 mb-1">Pagos registrados</p>
                      <p className="text-2xl font-bold text-blue-700">{resultadoConsulta.cantidad}</p>
                    </div>
                  </div>

                  {/* Por cobrador */}
                  {resultadoConsulta.por_cobrador?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Por cobrador</p>
                      <div className="space-y-1.5">
                        {resultadoConsulta.por_cobrador.map(c => (
                          <div key={c.nombre} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                            <span className="text-sm text-gray-700 font-medium">{c.nombre}</span>
                            <div className="text-right">
                              <span className="text-sm font-bold text-gray-800">{fmt(c.total)}</span>
                              <span className="text-xs text-gray-400 ml-2">{c.cantidad} pago{c.cantidad !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Toggle detalle */}
                  {resultadoConsulta.pagos?.length > 0 && (
                    <div>
                      <button
                        onClick={() => setVerDetallePagos(!verDetallePagos)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {verDetallePagos ? '▲ Ocultar detalle' : `▼ Ver detalle (${resultadoConsulta.pagos.length} pagos)`}
                      </button>

                      {verDetallePagos && (
                        <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
                          {resultadoConsulta.pagos.map(p => (
                            <div key={p.id_pago} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <p className="font-medium text-gray-800 truncate">{p.cliente_nombre}</p>
                                <p className="text-gray-400">{p.cobrador_nombre} · {p.tipo_pago?.replace(/_/g, ' ')}</p>
                              </div>
                              <div className="text-right shrink-0 ml-3">
                                <p className="font-bold text-gray-700">{fmt(p.monto_pago)}</p>
                                <p className="text-gray-400">
                                  {new Date(p.fecha_pago).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {resultadoConsulta.cantidad === 0 && (
                    <p className="text-center text-gray-400 text-sm py-2">Sin pagos registrados ese día</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
