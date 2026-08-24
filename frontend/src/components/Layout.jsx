import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { queueCount, queueErrorCount, sincronizarCola } from '../utils/offlineQueue'
import api from '../api'

const menu = [
  { path: '/',          label: 'Dashboard',  icono: '📊', roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/clientes',  label: 'Clientes',   icono: '👥', roles: ['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/productos', label: 'Productos',  icono: '📦', roles: ['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/ventas',    label: 'Ventas',     icono: '🧾', roles: ['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/cobranza',  label: 'Cobranza',   icono: '💰', roles: ['cobrador', 'administrador', 'supervisor_cobranza'] },
  { path: '/visitas',   label: 'Agenda',     icono: '📅', roles: ['cobrador', 'administrador', 'supervisor_cobranza'] },
  { path: '/mapa',      label: 'Mapa',       icono: '🗺️',  roles: ['cobrador', 'jefe_camioneta', 'administrador', 'supervisor_cobranza'] },
  { path: '/listado',   label: 'Listado',    icono: '📋', roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/lista-negra', label: 'Lista Negra', icono: '⛔', roles: null },
  { path: '/cortes',      label: 'Cortes',      icono: '✂️',  roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/usuarios',    label: 'Usuarios',    icono: '👤', roles: ['administrador', 'supervisor_cobranza'] },
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
  const [conErrores, setConErrores] = useState(queueErrorCount())
  const [toast, setToast]           = useState(null)
  const [comentariosNoLeidos, setComentariosNoLeidos] = useState(0)

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
    let sincronizando = false
    const actualizarConteo = () => { setPendientes(queueCount()); setConErrores(queueErrorCount()) }

    const sincronizarSiHayPendientes = async (silencioso = false) => {
      const pendientesActuales = queueCount()
      if (pendientesActuales === 0 || sincronizando) return
      sincronizando = true
      try {
        if (!silencioso) mostrarToast(`Sincronizando ${pendientesActuales} cambio(s) pendiente(s)...`, 'info')
        const resultado = await sincronizarCola()
        setPendientes(queueCount())
        setConErrores(queueErrorCount())
        if (resultado.sincronizados > 0) {
          mostrarToast(`✅ ${resultado.sincronizados} cambio(s) sincronizados correctamente`, 'exito')
        }
        if (resultado.errores > 0 && !silencioso) {
          mostrarToast(`⚠️ ${resultado.errores} cambio(s) no pudieron sincronizarse`, 'error')
        }
      } finally {
        sincronizando = false
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

    // Reintento periódico: el navegador puede seguir "creyendo" que hay señal
    // aunque esté muy débil y las peticiones fallen, sin que el evento 'online'
    // vuelva a dispararse. Se reintenta cada minuto en silencio (solo avisa si
    // realmente logra sincronizar algo).
    const intervalo = setInterval(() => {
      if (navigator.onLine) sincronizarSiHayPendientes(true)
    }, 60000)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('offline-queue-changed', actualizarConteo)
      clearInterval(intervalo)
    }
  }, [])

  // Comentarios de cobranza sin leer (badge en el menú)
  useEffect(() => {
    if (!['administrador', 'supervisor_cobranza'].includes(usuario?.rol)) return

    const consultarComentarios = () => {
      api.get('/pagos/comentarios').then(r => {
        setComentariosNoLeidos(r.data.no_leidos || 0)
      }).catch(() => {})
    }

    consultarComentarios()
    const intervalo = setInterval(consultarComentarios, 60000)
    window.addEventListener('comentarios-actualizados', consultarComentarios)

    return () => {
      clearInterval(intervalo)
      window.removeEventListener('comentarios-actualizados', consultarComentarios)
    }
  }, [usuario?.rol])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Cachés de datos (cuentas, clientes, visitas...) que NO deben borrarse al
  // actualizar — si se borran y el cobrador se queda sin señal después, se
  // queda sin nada guardado hasta que vuelva a tener conexión.
  const CACHES_DE_DATOS = [
    'api-cuentas', 'api-clientes', 'api-cuenta-detalle', 'api-ventas',
    'api-visitas-cuenta', 'api-visitas-agenda',
  ]

  const handleForzarActualizacion = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(r => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        const aBorrar = keys.filter(k => !CACHES_DE_DATOS.includes(k))
        await Promise.all(aBorrar.map(k => caches.delete(k)))
      }
    } finally {
      window.location.reload(true)
    }
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
              <span className="relative text-lg leading-none">
                {item.icono}
                {item.path === '/' && comentariosNoLeidos > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] leading-none min-w-[14px] h-[14px] rounded-full flex items-center justify-center px-0.5">
                    {comentariosNoLeidos > 9 ? '9+' : comentariosNoLeidos}
                  </span>
                )}
              </span>
              {!colapsado && (
                <span className="flex items-center gap-1.5">
                  {item.label}
                  {item.path === '/' && comentariosNoLeidos > 0 && (
                    <span className="bg-red-500 text-white text-[10px] leading-none min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                      {comentariosNoLeidos > 9 ? '9+' : comentariosNoLeidos}
                    </span>
                  )}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Indicador de conexión */}
        <div className={[
          'mx-2 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
          conErrores > 0 ? 'bg-amber-900/60 text-amber-300' : enLinea ? 'bg-gray-800 text-gray-300' : 'bg-red-900/60 text-red-300',
          colapsado ? 'justify-center' : '',
        ].join(' ')}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${conErrores > 0 ? 'bg-amber-400 animate-pulse' : enLinea ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
          {!colapsado && (
            <span>
              {conErrores > 0
                ? `⚠️ ${conErrores} no se pudo(pudieron) enviar — revisar`
                : enLinea
                  ? 'En línea'
                  : `Sin conexión${pendientes > 0 ? ` — ${pendientes} cambio(s) pendiente(s)` : ''}`
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
                onClick={handleForzarActualizacion}
                className="text-left text-xs text-gray-500 hover:text-gray-300 transition mb-2 flex items-center gap-1"
                title="Actualizar el código de la app (no borra los datos guardados sin conexión)"
              >
                🔄 Actualizar app
              </button>
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
