import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'

const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

export default function Dashboard() {
  const { usuario } = useAuth()
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(true)

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {fila1.map(card => (
          <div key={card.label} className="bg-white rounded-2xl shadow p-6">
            <div className={`w-10 h-10 ${card.color} rounded-xl mb-4`} />
            <p className="text-gray-500 text-sm">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${cargando ? 'text-gray-300 animate-pulse' : 'text-gray-800'}`}>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {fila2.map(card => (
          <div key={card.label} className="bg-white rounded-2xl shadow p-6">
            <div className={`w-10 h-10 ${card.color} rounded-xl mb-4`} />
            <p className="text-gray-500 text-sm">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${cargando ? 'text-gray-300 animate-pulse' : 'text-gray-800'}`}>
              {card.valor}
            </p>
            {card.sub && (
              <p className={`text-xs mt-1 ${card.texto}`}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>
    </Layout>
  )
}
