import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Dashboard() {
  const { usuario } = useAuth()

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">
          Bienvenido, {usuario?.nombre} 👋
        </h2>
        <p className="text-gray-500 mt-1">Panel de administración</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Clientes activos',   valor: '—', color: 'bg-blue-500'   },
          { label: 'Ventas del día',      valor: '—', color: 'bg-green-500'  },
          { label: 'Cobranza del día',    valor: '—', color: 'bg-yellow-500' },
          { label: 'Clientes morosos',    valor: '—', color: 'bg-red-500'    },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl shadow p-6">
            <div className={`w-10 h-10 ${card.color} rounded-xl mb-4`} />
            <p className="text-gray-500 text-sm">{card.label}</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{card.valor}</p>
          </div>
        ))}
      </div>
    </Layout>
  )
}