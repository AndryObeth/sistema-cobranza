import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    // Un 401 del propio login es "contraseña incorrecta", no "sesión expirada"
    // (no hay sesión que expirar) — no debe redirigir y pisar ese mensaje.
    // Solo 401 cierra sesión (token ausente/vencido/inválido, o usuario
    // desactivado — auth.js). Un 403 es "sí sé quién eres, pero esto no te
    // toca" (ej. un rol sin permiso para cierta acción) y NO debe cerrar la
    // sesión — cada pantalla ya muestra su propio mensaje de error con el
    // texto que manda el backend.
    const esLogin = err.config?.url?.includes('/auth/login')
    if (!esLogin && err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      window.location.href = '/login?sesion=expirada'
    }
    return Promise.reject(err)
  }
)

export default api
