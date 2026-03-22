import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const menu = [
  { path: '/',          label: 'Dashboard',  icono: '📊', roles: ['administrador'] },
  { path: '/clientes',  label: 'Clientes',   icono: '👥', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/productos', label: 'Productos',  icono: '📦', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/ventas',    label: 'Ventas',     icono: '🧾', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/cobranza',  label: 'Cobranza',   icono: '💰', roles: ['cobrador', 'administrador'] },
  { path: '/visitas',   label: 'Agenda',     icono: '📅', roles: ['cobrador', 'administrador'] },
  { path: '/cortes',    label: 'Cortes',      icono: '✂️', roles: ['administrador'] },
  { path: '/usuarios',  label: 'Usuarios',   icono: '👤', roles: ['administrador'] },
]

export default function Layout({ children }) {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <h1 className="font-bold text-lg">Novedades Cancún</h1>
          <p className="text-gray-400 text-xs mt-1 capitalize">{usuario?.rol}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menu.filter(item => !item.roles || item.roles.includes(usuario?.rol)).map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition
                ${location.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'}`}
            >
              <span>{item.icono}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <p className="text-gray-400 text-xs mb-2">{usuario?.nombre}</p>
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-red-400 hover:text-red-300 transition"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}