import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'

const FORM_VACIO = {
  nombre: '', alias: '', telefono: '', municipio: '', colonia: '', motivo: '', observaciones: ''
}

export default function ListaNegra() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'administrador'

  const [registros, setRegistros]   = useState([])
  const [cargando, setCargando]     = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando]     = useState(null) // registro a editar
  const [form, setForm]             = useState(FORM_VACIO)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
  const [confirmEliminar, setConfirmEliminar] = useState(null) // id a eliminar

  useEffect(() => {
    cargar()
  }, [])

  const cargar = async (q = '') => {
    setCargando(true)
    try {
      const res = await api.get('/lista-negra', { params: q ? { q } : {} })
      setRegistros(res.data)
    } catch {
      setRegistros([])
    } finally {
      setCargando(false)
    }
  }

  // Buscar al escribir (debounce simple)
  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda), 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const abrirNuevo = () => {
    setEditando(null)
    setForm(FORM_VACIO)
    setError('')
    setModalAbierto(true)
  }

  const abrirEditar = (r) => {
    setEditando(r)
    setForm({
      nombre:        r.nombre        || '',
      alias:         r.alias         || '',
      telefono:      r.telefono      || '',
      municipio:     r.municipio     || '',
      colonia:       r.colonia       || '',
      motivo:        r.motivo        || '',
      observaciones: r.observaciones || '',
    })
    setError('')
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setEditando(null)
    setForm(FORM_VACIO)
    setError('')
  }

  const handleGuardar = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.motivo.trim()) { setError('El motivo es obligatorio'); return }
    setGuardando(true)
    setError('')
    try {
      if (editando) {
        await api.put(`/lista-negra/${editando.id_lista_negra}`, form)
      } else {
        await api.post('/lista-negra', form)
      }
      cerrarModal()
      cargar(busqueda)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (id) => {
    try {
      await api.delete(`/lista-negra/${id}`)
      setConfirmEliminar(null)
      cargar(busqueda)
    } catch {
      alert('Error al eliminar el registro')
    }
  }

  const campo = (key, label, placeholder, tipo = 'text', requerido = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{requerido && <span className="text-red-500 ml-1">*</span>}
      </label>
      {tipo === 'textarea' ? (
        <textarea
          rows={3}
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
        />
      ) : (
        <input
          type={tipo}
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      )}
    </div>
  )

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-red-600">⛔</span> Lista Negra
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Clientes con historial de mala paga — consulta antes de realizar una venta
          </p>
        </div>
        {esAdmin && (
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
          >
            + Agregar
          </button>
        )}
      </div>

      {/* Banner aviso */}
      <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-3">
        <span className="text-red-500 text-xl shrink-0 mt-0.5">⚠️</span>
        <p className="text-red-700 text-sm">
          <span className="font-semibold">Consulta obligatoria antes de una venta.</span>{' '}
          Si el cliente aparece en esta lista, <span className="font-semibold">no realizar la venta</span>.
          Solo el administrador puede agregar o eliminar registros.
        </p>
      </div>

      {/* Buscador */}
      <div className="mb-5 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text"
          placeholder="Buscar por nombre, alias, teléfono, municipio..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
          >✕</button>
        )}
      </div>

      {/* Resultados */}
      {cargando ? (
        <p className="text-center text-gray-500 py-16">Cargando...</p>
      ) : registros.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500 font-medium">
            {busqueda ? 'Ningún resultado para esa búsqueda' : 'La lista negra está vacía'}
          </p>
          {busqueda && (
            <p className="text-green-600 text-sm mt-1">Este cliente no aparece en la lista negra</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            {registros.length} registro{registros.length !== 1 ? 's' : ''}
            {busqueda && <span className="text-red-600 font-medium ml-1">— ⚠️ Cliente(s) encontrado(s) en lista negra</span>}
          </p>

          {/* Grid de tarjetas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {registros.map(r => (
              <div key={r.id_lista_negra} className="bg-white rounded-2xl shadow border-l-4 border-red-500 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-base leading-tight">{r.nombre}</p>
                    {r.alias && <p className="text-gray-500 text-xs mt-0.5">Alias: {r.alias}</p>}
                  </div>
                  <span className="shrink-0 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                    No vender
                  </span>
                </div>

                <div className="space-y-1 mb-3">
                  {r.telefono && (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <span className="text-gray-400">📞</span> {r.telefono}
                    </p>
                  )}
                  {(r.municipio || r.colonia) && (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <span className="text-gray-400">📍</span>
                      {[r.colonia, r.municipio].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>

                <div className="bg-red-50 rounded-xl px-3 py-2 mb-3">
                  <p className="text-xs font-semibold text-red-600 mb-0.5">Motivo</p>
                  <p className="text-sm text-red-800">{r.motivo}</p>
                </div>

                {r.observaciones && (
                  <p className="text-xs text-gray-500 italic mb-3">{r.observaciones}</p>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">
                      {new Date(r.fecha_registro).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}
                    </p>
                    {r.registrado_por?.nombre && (
                      <p className="text-xs text-gray-400">por {r.registrado_por.nombre}</p>
                    )}
                  </div>
                  {esAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEditar(r)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >Editar</button>
                      <button
                        onClick={() => setConfirmEliminar(r.id_lista_negra)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >Eliminar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal agregar / editar */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[95svh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-bold text-gray-800">
                {editando ? 'Editar registro' : 'Agregar a lista negra'}
              </h3>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {campo('nombre',    'Nombre completo',  'Ej. Juan Pérez García',      'text', true)}
              {campo('alias',     'Alias / apodo',    'Ej. El Güero',               'text')}
              {campo('telefono',  'Teléfono',         'Ej. 287 123 4567',           'text')}
              {campo('municipio', 'Municipio',        'Ej. Tuxtepec',               'text')}
              {campo('colonia',   'Colonia / localidad', 'Ej. Centro',              'text')}
              {campo('motivo',    'Motivo',           'Ej. Crédito impagado, fuga...', 'text', true)}
              {campo('observaciones', 'Observaciones adicionales', 'Detalles relevantes...', 'textarea')}

              {error && (
                <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
              <button
                onClick={cerrarModal}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition"
              >
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar a lista negra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm eliminar */}
      {confirmEliminar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <p className="text-lg font-bold text-gray-800 mb-2">¿Eliminar de la lista?</p>
            <p className="text-gray-500 text-sm mb-6">
              El registro se desactivará. Podrá volver a aparecer si se vuelve a agregar.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmEliminar(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl font-medium text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEliminar(confirmEliminar)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl font-semibold text-sm"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
