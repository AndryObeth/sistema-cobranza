import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { queueCount, sincronizarCola } from '../utils/offlineQueue'

const menu = [
  { path: '/',          label: 'Dashboard',  icono: '📊', roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/clientes',  label: 'Clientes',   icono: '👥', roles: ['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/productos', label: 'Productos',  icono: '📦', roles: ['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/ventas',    label: 'Ventas',     icono: '🧾', roles: ['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/cobranza',  label: 'Cobranza',   icono: '💰', roles: ['cobrador', 'administrador', 'supervisor_cobranza'] },
  { path: '/visitas',   label: 'Agenda',     icono: '📅', roles: ['cobrador', 'administrador', 'supervisor_cobranza'] },
  { path: '/mapa',      label: 'Mapa',       icono: '🗺️',  roles: ['cobrador', 'jefe_camioneta', 'administrador', 'supervisor_cobranza'] },
  { path: '/listado',   label: 'Listado',    icono: '📋', roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/cortes',    label: 'Cortes',     icono: '✂️',  roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/usuarios',  label: 'Usuarios',   icono: '👤', roles: ['administrador', 'supervisor_cobranza'] },
]

export default function Layout({ children }) {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem('sidebar_colapsado') === 'true'
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [enLinea, setEnLinea]       = useState(navigator.onLine)
  const [pendientes, setPendientes] = useState(queueCount())
  const [toast, setToast]           = useState(null)

  const mostrarToast = (mensaje, tipo = 'info') => {
    setToast({ mensaje, tipo })
    setTimeout(() => setToast(null), 4000)
  }

  const toggleSidebar = () => {
    setColapsado(prev => {
      const next = !prev
      localStorage.setItem('sidebar_colapsado', String(next))
      return next
    })
  }

  useEffect(() => {
    const actualizarConteo = () => setPendientes(queueCount())

    const sincronizarSiHayPendientes = async () => {
      const pendientesActuales = queueCount()
      if (pendientesActuales > 0) {
        mostrarToast(`Sincronizando ${pendientesActuales} pago(s) pendiente(s)...`, 'info')
        const resultado = await sincronizarCola()
        setPendientes(queueCount())
        if (resultado.sincronizados > 0) {
          mostrarToast(`✅ ${resultado.sincronizados} pago(s) sincronizados correctamente`, 'exito')
        }
        if (resultado.errores > 0) {
          mostrarToast(`⚠️ ${resultado.errores} pago(s) no pudieron sincronizarse`, 'error')
        }
      }
    }

    const handleOnline = async () => {
      setEnLinea(true)
      await sincronizarSiHayPendientes()
    }

    const handleOffline = () => setEnLinea(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('offline-queue-changed', actualizarConteo)

    // Sincronizar al montar si ya hay conexión y hay pendientes
    if (navigator.onLine) sincronizarSiHayPendientes()

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

  const itemsMenu = menu.filter(item => !item.roles || item.roles.includes(usuario?.rol))

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.tipo === 'exito' ? 'bg-green-600 text-white' :
            toast.tipo === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'}`}>
          {toast.mensaje}
        </div>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={[
        'fixed md:relative inset-y-0 left-0 z-50 md:z-auto',
        'flex flex-col bg-gray-900 text-white',
        'transition-all duration-300 shrink-0',
        'w-64',
        colapsado ? 'md:w-16' : 'md:w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}>

        {/* Header */}
        <div className={`flex items-center border-b border-gray-700 px-3 py-3 ${colapsado ? 'justify-center' : 'justify-between gap-2'}`}>
          {!colapsado && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain shrink-0" />
              <div className="min-w-0">
                <h1 className="font-bold text-sm leading-tight truncate">Novedades Cancún</h1>
                <p className="text-gray-400 text-xs mt-0.5 capitalize">{usuario?.rol}</p>
              </div>
            </div>
          )}
          {colapsado && (
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          )}
          {/* Desktop toggle */}
          <button
            onClick={toggleSidebar}
            title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
            className="hidden md:flex w-8 h-8 items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition shrink-0 text-base"
          >
            ☰
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-gray-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {itemsMenu.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              title={colapsado ? item.label : undefined}
              className={[
                'flex items-center gap-3 px-3 rounded-lg text-sm transition min-h-[44px]',
                colapsado ? 'justify-center' : '',
                location.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700',
              ].join(' ')}
            >
              <span className="text-lg leading-none">{item.icono}</span>
              {!colapsado && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Indicador de conexión */}
        <div className={[
          'mx-2 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
          enLinea ? 'bg-gray-800 text-gray-300' : 'bg-red-900/60 text-red-300',
          colapsado ? 'justify-center' : '',
        ].join(' ')}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${enLinea ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
          {!colapsado && (
            <span>
              {enLinea
                ? 'En línea'
                : `Sin conexión${pendientes > 0 ? ` — ${pendientes} pago(s) pendiente(s)` : ''}`
              }
            </span>
          )}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t border-gray-700 ${colapsado ? 'flex justify-center' : ''}`}>
          {colapsado ? (
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="flex items-center justify-center w-10 h-10 text-red-400 hover:text-red-300 transition text-xl rounded-lg hover:bg-gray-800"
            >
              🚪
            </button>
          ) : (
            <>
              <p className="text-gray-400 text-xs mb-2 truncate">{usuario?.nombre}</p>
              <button
                onClick={handleLogout}
                className="text-left text-sm text-red-400 hover:text-red-300 transition min-h-[44px] flex items-center"
              >
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Botón hamburguesa móvil (siempre visible en mobile) */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        className="fixed top-3 left-3 z-30 md:hidden bg-gray-900 text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-lg text-base"
      >
        ☰
      </button>

      {/* Contenido principal */}
      <main className="flex-1 min-w-0 p-4 pt-16 md:pt-6 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
