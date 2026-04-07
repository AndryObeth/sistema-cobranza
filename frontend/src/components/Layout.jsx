import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { queueCount, onReconexion, sincronizarCola } from '../utils/offlineQueue'

const menu = [
  { path: '/',          label: 'Dashboard',  icono: '📊', roles: ['administrador'] },
  { path: '/clientes',  label: 'Clientes',   icono: '👥', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/productos', label: 'Productos',  icono: '📦', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/ventas',    label: 'Ventas',     icono: '🧾', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/cobranza',  label: 'Cobranza',   icono: '💰', roles: ['cobrador', 'administrador'] },
  { path: '/visitas',   label: 'Agenda',     icono: '📅', roles: ['cobrador', 'administrador'] },
  { path: '/cortes',    label: 'Cortes',     icono: '✂️', roles: ['administrador'] },
  { path: '/usuarios',  label: 'Usuarios',   icono: '👤', roles: ['administrador'] },
]

export default function Layout({ children }) {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [enLinea, setEnLinea]       = useState(navigator.onLine)
  const [pendientes, setPendientes] = useState(queueCount())
  const [toast, setToast]           = useState(null) // { mensaje, tipo }

  const mostrarToast = (mensaje, tipo = 'info') => {
    setToast({ mensaje, tipo })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const actualizarConteo = () => setPendientes(queueCount())

    // Estado de conexión
    const handleOnline = async () => {
      setEnLinea(true)
      const pendientesActuales = queueCount()
      if (pendientesActuales > 0) {
        mostrarToast(`Conexión restaurada — sincronizando ${pendientesActuales} pago(s)...`, 'info')
        const resultado = await sincronizarCola()
        setPendientes(queueCount())
        if (resultado.sincronizados > 0) {
          mostrarToast(`✅ ${resultado.sincronizados} pago(s) sincronizados correctamente`, 'exito')
        }
        if (resultado.errores > 0) {
          mostrarToast(`⚠️ ${resultado.errores} pago(s) no pudieron sincronizarse`, 'error')
        }
      } else {
        setEnLinea(true)
      }
    }

    const handleOffline = () => setEnLinea(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('offline-queue-changed', actualizarConteo)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('offline-queue-changed', actualizarConteo)
    }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Toast de notificación */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
          ${toast.tipo === 'exito' ? 'bg-green-600 text-white' :
            toast.tipo === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'}`}>
          {toast.mensaje}
        </div>
      )}

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

        {/* Indicador de conexión */}
        <div className={`mx-4 mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2
          ${enLinea ? 'bg-gray-800 text-gray-300' : 'bg-red-900/60 text-red-300'}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${enLinea ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
          {enLinea
            ? 'En línea'
            : `Sin conexión${pendientes > 0 ? ` — ${pendientes} pago(s) pendiente(s)` : ''}`
          }
        </div>

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
