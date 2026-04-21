import { useState, useEffect } from 'react'
import api from '../api.js'
import { encodePlusCode, decodePlusCode, isValidPlusCode } from '../utils/plusCode.js'

const ETIQUETAS = ['Domicilio', 'Trabajo', 'Casa familiar', 'Otro']

const FORM_VACIO = {
  etiqueta: '', nombre_contacto: '', descripcion: '', plus_code: '', es_principal: false
}

export default function UbicacionesPanel({ idCliente, puedeEditar = false }) {
  const [ubicaciones, setUbicaciones]   = useState([])
  const [cargando, setCargando]         = useState(true)
  const [formAbierto, setFormAbierto]   = useState(false)
  const [editando, setEditando]         = useState(null) // id_ubicacion en edición
  const [form, setForm]                 = useState(FORM_VACIO)
  const [buscandoGPS, setBuscandoGPS]   = useState(false)
  const [guardando, setGuardando]       = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    if (!idCliente) return
    setCargando(true)
    api.get(`/clientes/${idCliente}/ubicaciones`)
      .then(r => setUbicaciones(r.data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [idCliente])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(FORM_VACIO)
    setError('')
    setFormAbierto(true)
  }

  const abrirEditar = (u) => {
    setEditando(u.id_ubicacion)
    setForm({
      etiqueta:        u.etiqueta,
      nombre_contacto: u.nombre_contacto || '',
      descripcion:     u.descripcion     || '',
      plus_code:       u.plus_code       || '',
      es_principal:    u.es_principal,
    })
    setError('')
    setFormAbierto(true)
  }

  const cancelar = () => { setFormAbierto(false); setEditando(null); setForm(FORM_VACIO); setError('') }

  const capturarGPS = () => {
    if (!navigator.geolocation) { setError('GPS no disponible'); return }
    setBuscandoGPS(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pc = encodePlusCode(coords.latitude, coords.longitude)
        setForm(f => ({ ...f, plus_code: pc }))
        setBuscandoGPS(false)
      },
      () => { setError('No se pudo obtener la ubicación GPS'); setBuscandoGPS(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const guardar = async () => {
    if (!form.etiqueta.trim()) { setError('Ingresa una etiqueta'); return }
    setGuardando(true)
    setError('')
    try {
      const payload = {
        etiqueta:        form.etiqueta.trim(),
        nombre_contacto: form.nombre_contacto || null,
        descripcion:     form.descripcion     || null,
        plus_code:       form.plus_code       || null,
        es_principal:    form.es_principal,
      }
      if (form.plus_code && isValidPlusCode(form.plus_code)) {
        const coords = decodePlusCode(form.plus_code)
        if (coords) { payload.latitud = coords.lat; payload.longitud = coords.lng }
      }

      let res
      if (editando) {
        res = await api.put(`/clientes/${idCliente}/ubicaciones/${editando}`, payload)
        setUbicaciones(prev => prev.map(u => u.id_ubicacion === editando ? res.data : u))
      } else {
        res = await api.post(`/clientes/${idCliente}/ubicaciones`, payload)
        setUbicaciones(prev => {
          const lista = form.es_principal ? prev.map(u => ({ ...u, es_principal: false })) : prev
          return [...lista, res.data]
        })
      }
      cancelar()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar esta ubicación?')) return
    try {
      await api.delete(`/clientes/${idCliente}/ubicaciones/${id}`)
      setUbicaciones(prev => prev.filter(u => u.id_ubicacion !== id))
    } catch { alert('Error al eliminar') }
  }

  if (cargando) return <p className="text-sm text-gray-400 animate-pulse py-4">Cargando ubicaciones...</p>

  return (
    <div className="space-y-3">

      {/* Lista */}
      {ubicaciones.length === 0 && !formAbierto && (
        <p className="text-sm text-gray-400 italic py-2">Sin ubicaciones registradas</p>
      )}

      {ubicaciones.map(u => (
        <div key={u.id_ubicacion} className={`rounded-xl border px-4 py-3 ${u.es_principal ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.es_principal ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {u.etiqueta}
                </span>
                {u.es_principal && <span className="text-xs text-blue-500">Principal</span>}
              </div>
              {u.nombre_contacto && (
                <p className="text-sm font-medium text-gray-800 mt-1">👤 {u.nombre_contacto}</p>
              )}
              {u.descripcion && (
                <p className="text-xs text-gray-600 mt-0.5">{u.descripcion}</p>
              )}
              {u.plus_code && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded">{u.plus_code}</span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(u.plus_code)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    📍 Maps
                  </a>
                </div>
              )}
            </div>
            {puedeEditar && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => abrirEditar(u)} className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">Editar</button>
                <button onClick={() => eliminar(u.id_ubicacion)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">✕</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Formulario nuevo/editar */}
      {formAbierto && puedeEditar && (
        <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-800">{editando ? 'Editar ubicación' : 'Nueva ubicación'}</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Etiqueta *</label>
              <input
                list="etiquetas-sugeridas"
                value={form.etiqueta}
                onChange={e => setForm(f => ({ ...f, etiqueta: e.target.value }))}
                placeholder="Domicilio, Trabajo…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="etiquetas-sugeridas">
                {ETIQUETAS.map(e => <option key={e} value={e} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre del contacto</label>
              <input
                value={form.nombre_contacto}
                onChange={e => setForm(f => ({ ...f, nombre_contacto: e.target.value }))}
                placeholder="Ej: Hermana Ana"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas / referencias</label>
            <input
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Ej: Mercado Juárez, local 12"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Plus Code (ubicación GPS)</label>
            <div className="flex gap-2">
              <input
                value={form.plus_code}
                onChange={e => setForm(f => ({ ...f, plus_code: e.target.value.toUpperCase() }))}
                placeholder="Ej: 76C9+7H6"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={capturarGPS}
                disabled={buscandoGPS}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 shrink-0"
              >
                {buscandoGPS ? '…' : '🎯 GPS'}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.es_principal}
              onChange={e => setForm(f => ({ ...f, es_principal: e.target.checked }))}
              className="rounded"
            />
            Marcar como ubicación principal
          </label>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button" onClick={cancelar}
              className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
            >Cancelar</button>
            <button
              type="button" onClick={guardar} disabled={guardando}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar ubicación'}
            </button>
          </div>
        </div>
      )}

      {/* Botón agregar */}
      {puedeEditar && !formAbierto && (
        <button
          type="button" onClick={abrirNuevo}
          className="w-full border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 py-2 rounded-xl text-sm font-medium transition"
        >
          + Agregar ubicación
        </button>
      )}
    </div>
  )
}
