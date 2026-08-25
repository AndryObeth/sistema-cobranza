import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import UpdatePrompt from './components/UpdatePrompt'
import Login from './pages/auth/Login.jsx'

// Cada página en su propio chunk: el bundle inicial solo carga lo necesario
// para el login, y el resto se descarga bajo demanda al navegar. Importa en
// la conexión débil de un cobrador en ruta, que es el caso más común aquí.
const Dashboard   = lazy(() => import('./pages/dashboard/Dashboard.jsx'))
const Clientes    = lazy(() => import('./pages/clientes/Clientes.jsx'))
const Productos   = lazy(() => import('./pages/productos/Productos.jsx'))
const Ventas      = lazy(() => import('./pages/ventas/Ventas.jsx'))
const Cobranza    = lazy(() => import('./pages/cobranza/Cobranza.jsx'))
const Usuarios    = lazy(() => import('./pages/usuarios/Usuarios.jsx'))
const Visitas     = lazy(() => import('./pages/visitas/Visitas.jsx'))
const Cortes      = lazy(() => import('./pages/cortes/Cortes.jsx'))
const Mapa        = lazy(() => import('./pages/mapa/Mapa.jsx'))
const Listado     = lazy(() => import('./pages/listado/Listado.jsx'))
const ListaNegra  = lazy(() => import('./pages/listaNegra/ListaNegra.jsx'))

function CargandoPagina() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )
}

function paginaInicio(rol) {
  if (rol === 'cobrador' || rol === 'supervisor_cobranza') return '/cobranza'
  return '/clientes'
}

function RutaProtegida({ children, roles }) {
  const { token, usuario } = useAuth()
  if (!token) return <Navigate to="/login" />
  if (roles && !roles.includes(usuario?.rol)) return <Navigate to={paginaInicio(usuario?.rol)} />
  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RutaProtegida roles={['administrador', 'supervisor_cobranza']}><Dashboard /></RutaProtegida>} />
        <Route path="/clientes" element={<RutaProtegida roles={['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta']}><Clientes /></RutaProtegida>} />
        <Route path="/productos" element={<RutaProtegida roles={['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta']}><Productos /></RutaProtegida>} />
        <Route path="/ventas" element={<RutaProtegida roles={['administrador', 'supervisor_cobranza', 'secretaria', 'vendedor', 'jefe_camioneta']}><Ventas /></RutaProtegida>} />
        <Route path="/cobranza" element={<RutaProtegida roles={['cobrador', 'administrador', 'supervisor_cobranza']}><Cobranza /></RutaProtegida>} />
        <Route path="/usuarios" element={<RutaProtegida roles={['administrador', 'supervisor_cobranza']}><Usuarios /></RutaProtegida>} />
        <Route path="/visitas"  element={<RutaProtegida roles={['cobrador', 'administrador', 'supervisor_cobranza']}><Visitas /></RutaProtegida>} />
        <Route path="/cortes"   element={<RutaProtegida roles={['administrador', 'supervisor_cobranza']}><Cortes /></RutaProtegida>} />
        <Route path="/mapa"     element={<RutaProtegida roles={['cobrador', 'jefe_camioneta', 'administrador', 'supervisor_cobranza']}><Mapa /></RutaProtegida>} />
        <Route path="/listado"     element={<RutaProtegida roles={['administrador', 'supervisor_cobranza']}><Listado /></RutaProtegida>} />
        <Route path="/lista-negra" element={<RutaProtegida><ListaNegra /></RutaProtegida>} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <UpdatePrompt />
      </BrowserRouter>
    </AuthProvider>
  )
}