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

function RutaProtegida({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RutaProtegida><Dashboard /></RutaProtegida>} />
      <Route path="/clientes" element={<RutaProtegida><Clientes /></RutaProtegida>} />
      <Route path="/productos" element={<RutaProtegida><Productos /></RutaProtegida>} />
      <Route path="/ventas" element={<RutaProtegida><Ventas /></RutaProtegida>} />
      <Route path="/cobranza" element={<RutaProtegida><Cobranza /></RutaProtegida>} />
      <Route path="/usuarios" element={<RutaProtegida><Usuarios /></RutaProtegida>} />
      <Route path="/visitas"  element={<RutaProtegida><Visitas /></RutaProtegida>} />
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