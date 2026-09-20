import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { queueCount, queueErrorCount, sincronizarCola } from '../utils/offlineQueue'
import api from '../api'

// El supervisor_cobranza ve exactamente lo mismo que un cobrador (Cobranza,
// Agenda, Mapa, Lista Negra, Cortes) más el apartado de Primera visita —
// ya no tiene el resto del acceso de administrador (Dashboard, Clientes,
// Productos, Ventas, Listado, Usuarios).
const menu = [
  { path: '/',          label: 'Dashboard',  icono: '📊', roles: ['administrador'] },
  { path: '/clientes',  label: 'Clientes',   icono: '👥', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/productos', label: 'Productos',  icono: '📦', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/ventas',    label: 'Ventas',     icono: '🧾', roles: ['administrador', 'secretaria', 'vendedor', 'jefe_camioneta'] },
  { path: '/cobranza',  label: 'Cobranza',   icono: '💰', roles: ['cobrador', 'administrador', 'supervisor_cobranza'] },
  { path: '/visitas',   label: 'Agenda',     icono: '📅', roles: ['cobrador', 'administrador', 'supervisor_cobranza'] },
  { path: '/mapa',      label: 'Mapa',       icono: '🗺️',  roles: ['cobrador', 'jefe_camioneta', 'administrador', 'supervisor_cobranza'] },
  { path: '/listado',   label: 'Listado',    icono: '📋', roles: ['administrador'] },
  { path: '/primera-visita', label: 'Primera visita', icono: '🔍', roles: ['administrador', 'supervisor_cobranza'] },
  { path: '/lista-negra', label: 'Lista Negra', icono: '⛔', roles: null },
  { path: '/cortes',      label: 'Cortes',      icono: '✂️',  roles: ['administrador', 'supervisor_cobranza', 'cobrador'] },
  { path: '/usuarios',    label: 'Usuarios',    icono: '👤', roles: ['administrador'] },
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
  const [pendientesVerificacion, setPendientesVerificacion] = useState(0)
  const [sincProgreso, setSincProgreso] = useState(null) // { hecho, total } | null

  const mostrarToast = (mensaje, tipo = 'info') => {
    setToast({ mensaje, tipo })
    setTimeout(() => setToast(null), 4000)
  }

  // Cachés de datos (cuentas, clientes, visitas...) que NO deben borrarse al
  // actualizar — si se borran y el cobrador se queda sin señal después, se
  // queda sin nada guardado hasta que vuelva a tener conexión.
  const CACHES_DE_DATOS = [
    'api-cuentas', 'api-clientes', 'api-cuenta-detalle', 'api-ventas',
    'api-visitas-cuenta', 'api-visitas-agenda', 'api-ubicaciones-cliente',
    'api-verificacion',
  ]

  // Después de sincronizar la cola offline, el caché NetworkFirst de estas
  // listas puede seguir teniendo la respuesta de ANTES del cambio (la
  // acción se guardó bien en el servidor, pero nadie le avisó al Service
  // Worker) — la próxima vez que se cargue esa lista, con mala suerte de
  // timing, puede servir esa versión vieja como si fuera buena ("se las
  // vuelve a arrojar": cuentas que ya se aprobaron/pagaron reaparecen).
  // Se borran aquí, recién confirmado que hay señal y se subió algo, para
  // forzar que el siguiente GET de cada una vaya de verdad al servidor.
  const limpiarCachesDeDatos = async () => {
    if (!('caches' in window)) return
    try { await Promise.all(CACHES_DE_DATOS.map(k => caches.delete(k))) } catch { /* no crítico */ }
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
      if (queueCount() === 0 || sincronizando || !navigator.onLine) return
      sincronizando = true
      try {
        // Reintenta en la misma tanda: si la señal se cae a medias, en vez de
        // esperar 60s al siguiente tic, vuelve a intentar con lo que quedó
        // (hasta 4 vueltas, con pausas cortas). Así los pagos suben "de una"
        // y no por partes con huecos de un minuto.
        let totalSinc = 0
        let totalErr = 0
        for (let vuelta = 0; vuelta < 4; vuelta++) {
          const restantes = queueCount()
          if (restantes === 0) break
          if (!navigator.onLine) break
          if (!silencioso && vuelta === 0) mostrarToast(`Subiendo ${restantes} pago(s)/cambio(s) pendiente(s)…`, 'info')
          const r = await sincronizarCola((hecho, total) => setSincProgreso({ hecho, total }))
          totalSinc += r.sincronizados
          totalErr  += r.errores
          setPendientes(queueCount())
          setConErrores(queueErrorCount())
          // Si ya no hay errores de red pendientes, no tiene caso otra vuelta.
          if (r.red === 0) break
          await new Promise(res => setTimeout(res, 3000))
        }
        setSincProgreso(null)
        if (totalSinc > 0) {
          mostrarToast(`✅ ${totalSinc} cambio(s) sincronizados`, 'exito')
          // Ver comentario en limpiarCachesDeDatos: sin esto, una lista que
          // ya tenía caché de ANTES de subir la cola puede seguir mostrando
          // esos datos viejos hasta que expire por su cuenta.
          await limpiarCachesDeDatos()
          window.dispatchEvent(new Event('verificacion-actualizada'))
          window.dispatchEvent(new Event('offline-sync-completado'))
        }
        if (totalErr > 0 && !silencioso) mostrarToast(`⚠️ ${totalErr} cambio(s) rechazados por el servidor — revísalos`, 'error')
        if (queueCount() > 0 && !silencioso && totalErr === 0) {
          mostrarToast(`Quedan ${queueCount()} por subir — se reintenta solo al mejorar la señal`, 'info')
        }
      } finally {
        sincronizando = false
        setSincProgreso(null)
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
    // vuelva a dispararse. Se reintenta cada 30s en silencio.
    const intervalo = setInterval(() => {
      if (navigator.onLine) sincronizarSiHayPendientes(true)
    }, 30000)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('offline-queue-changed', actualizarConteo)
      clearInterval(intervalo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Comentarios de cobranza sin leer (badge en el menú) — panel vive en
  // Dashboard, que el supervisor ya no ve (ver comentario junto a `menu`).
  useEffect(() => {
    if (usuario?.rol !== 'administrador') return

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

  // Cuentas nuevas pendientes de primera visita / aprobación final (badge)
  useEffect(() => {
    if (!['administrador', 'supervisor_cobranza'].includes(usuario?.rol)) return

    const consultarPendientes = () => {
      api.get('/cuentas/verificacion/conteo').then(r => {
        setPendientesVerificacion((r.data.pendientes_visita || 0) + (r.data.pendientes_aprobacion || 0))
      }).catch(() => {})
    }

    consultarPendientes()
    const intervalo = setInterval(consultarPendientes, 60000)
    window.addEventListener('verificacion-actualizada', consultarPendientes)

    return () => {
      clearInterval(intervalo)
      window.removeEventListener('verificacion-actualizada', consultarPendientes)
    }
  }, [usuario?.rol])

  // Reporta la posición GPS del cobrador/supervisor mientras tiene la app
  // abierta, para que el administrador vea "cobradores en vivo" en el Mapa.
  // Solo mientras hay señal y la pestaña está visible en primer plano — no es
  // rastreo en segundo plano ni se guarda nada si falla (se reintenta en el
  // próximo tic). Con señal débil (rural), esta petición NO debe competir con
  // la descarga de la lista de cuentas (mucho más pesada e importante): por
  // eso corre solo con la app activa (no con el celular guardado/pantalla
  // apagada) y con un timeout corto para soltar la conexión rápido si no hay
  // caso — reportado que sin esto, cobradores con señal intermitente se
  // quedaban sin la lista de cuentas al llegar a una zona sin señal porque
  // esta petición de fondo competía por la poca señal disponible.
  useEffect(() => {
    if (!['cobrador', 'supervisor_cobranza'].includes(usuario?.rol)) return
    if (!navigator.geolocation) return

    const reportarUbicacion = () => {
      if (!navigator.onLine) return
      if (document.visibilityState !== 'visible') return
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          api.put('/usuarios/mi-ubicacion',
            { lat: coords.latitude, lng: coords.longitude },
            { timeout: 4000 }
          ).catch(() => {})
        },
        () => {},
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
      )
    }

    reportarUbicacion()
    const intervalo = setInterval(reportarUbicacion, 90000)
    return () => clearInterval(intervalo)
  }, [usuario?.rol])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

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
                {item.path === '/primera-visita' && pendientesVerificacion > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white text-[9px] leading-none min-w-[14px] h-[14px] rounded-full flex items-center justify-center px-0.5">
                    {pendientesVerificacion > 9 ? '9+' : pendientesVerificacion}
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
                  {item.path === '/primera-visita' && pendientesVerificacion > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] leading-none min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                      {pendientesVerificacion > 9 ? '9+' : pendientesVerificacion}
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
          sincProgreso ? 'bg-blue-900/60 text-blue-200'
            : conErrores > 0 ? 'bg-amber-900/60 text-amber-300'
            : pendientes > 0 ? 'bg-blue-900/50 text-blue-200'
            : enLinea ? 'bg-gray-800 text-gray-300' : 'bg-red-900/60 text-red-300',
          colapsado ? 'justify-center' : '',
        ].join(' ')}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            sincProgreso ? 'bg-blue-400 animate-pulse'
              : conErrores > 0 ? 'bg-amber-400 animate-pulse'
              : pendientes > 0 ? 'bg-blue-400 animate-pulse'
              : enLinea ? 'bg-green-400' : 'bg-red-400 animate-pulse'
          }`} />
          {!colapsado && (
            <span>
              {sincProgreso
                ? `⬆️ Subiendo ${sincProgreso.hecho}/${sincProgreso.total}…`
                : conErrores > 0
                  ? `⚠️ ${conErrores} rechazado(s) por el servidor — revisar`
                  : pendientes > 0
                    ? `${pendientes} pendiente(s) de subir${enLinea ? '' : ' (sin conexión)'}`
                    : enLinea
                      ? 'En línea'
                      : 'Sin conexión'
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
