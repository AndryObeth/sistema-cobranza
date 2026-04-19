import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import Login from './pages/auth/Login.jsx'
import Dashboard from './pages/dashboard/Dashboard.jsx'
import Clientes from './pages/clientes/Clientes.jsx'
import Productos from './pages/productos/Productos.jsx'
import Ventas from './pages/ventas/Ventas.jsx'
import Cobranza from './pages/cobranza/Cobranza.jsx'
import Usuarios from './pages/usuarios/Usuarios.jsx'
import Visitas from './pages/visitas/Visitas.jsx'
import Cortes from './pages/cortes/Cortes.jsx'
import Mapa from './pages/mapa/Mapa.jsx'
import Listado from './pages/listado/Listado.jsx'

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
      <Route path="/listado"  element={<RutaProtegida roles={['administrador', 'supervisor_cobranza']}><Listado /></RutaProtegida>} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}