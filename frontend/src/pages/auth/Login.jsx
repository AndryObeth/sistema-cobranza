import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../api'

export default function Login() {
  const [form, setForm] = useState({ usuario: '', contrasena: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sesionExpirada = searchParams.get('sesion') === 'expirada'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCargando(true)
    setError('')
    try {
      const res = await api.post('/auth/login', form)
      login(res.data.usuario, res.data.token)
      navigate('/')
    } catch {
      setError('Usuario o contraseña incorrectos')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #40e0d0 0%, #20b2aa 50%, #1a8f8a 100%)',
      }}
    >
      {/* Círculos decorativos de fondo */}
      <div style={{
        position: 'fixed', top: '-80px', right: '-80px',
        width: 300, height: 300, borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '-60px', left: '-60px',
        width: 220, height: 220, borderRadius: '50%',
        background: 'rgba(255,255,255,0.10)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed', bottom: '15%', right: '8%',
        width: 120, height: 120, borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)', pointerEvents: 'none'
      }} />

      {/* Card */}
      <div className="w-full max-w-md relative" style={{ zIndex: 1 }}>
        <div
          className="bg-white rounded-3xl shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.20)' }}
        >
          {/* Header con logo */}
          <div
            className="flex flex-col items-center pt-8 pb-6 px-8"
            style={{
              background: 'linear-gradient(160deg, #1e3a8a 0%, #1e40af 100%)',
            }}
          >
            <img
              src="/logo.png"
              alt="Novedades Cancún"
              style={{ width: 130, height: 130, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}
            />
            <p className="text-white/80 text-sm mt-2 tracking-wide">Sistema de Cobranza</p>
          </div>

          {/* Franja dorada decorativa */}
          <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />

          {/* Formulario */}
          <div className="px-8 py-7">
            {sesionExpirada && (
              <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-800 text-sm text-center px-4 py-3 rounded-xl">
                Tu sesión expiró, inicia sesión nuevamente
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">Usuario</label>
                <input
                  type="text"
                  value={form.usuario}
                  onChange={e => setForm({ ...form, usuario: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-teal-400 transition text-sm"
                  placeholder="Ingresa tu usuario"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={form.contrasena}
                  onChange={e => setForm({ ...form, contrasena: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-teal-400 transition text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="w-full text-white font-bold py-3 rounded-xl transition disabled:opacity-60 mt-2"
                style={{ background: 'linear-gradient(90deg, #1e3a8a, #1e40af)', boxShadow: '0 4px 14px rgba(30,58,138,0.35)' }}
              >
                {cargando ? 'Entrando...' : 'Iniciar sesión'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
