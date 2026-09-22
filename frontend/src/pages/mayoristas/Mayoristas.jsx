import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { incluyeTexto } from '../../utils/texto.js'

const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const hoyISO = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD en hora local

const FORM_VACIO = { nombre: '', telefono: '', notas: '', saldo_inicial: '', fecha: hoyISO() }
const FORM_MOV_VACIO = { tipo: 'abono', monto: '', fecha: hoyISO(), observaciones: '' }

function fechaCorta(f) {
  return new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Mayoristas() {
  const [mayoristas, setMayoristas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [detalle, setDetalle] = useState(null) // mayorista abierto en el panel de movimientos
  const [movimientos, setMovimientos] = useState([])
  const [cargandoMovs, setCargandoMovs] = useState(false)
  const [formMov, setFormMov] = useState(FORM_MOV_VACIO)
  const [guardandoMov, setGuardandoMov] = useState(false)
  const [errorMov, setErrorMov] = useState('')

  const [confirmBaja, setConfirmBaja] = useState(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    try {
      const res = await api.get('/mayoristas')
      setMayoristas(res.data)
    } catch {
      setMayoristas([])
    } finally {
      setCargando(false)
    }
  }

  const mayoristasFiltrados = busqueda.trim()
    ? mayoristas.filter(m => incluyeTexto(m.nombre, busqueda) || incluyeTexto(m.telefono, busqueda))
    : mayoristas

  const totalPorCobrar = mayoristas.reduce((s, m) => s + parseFloat(m.saldo_actual), 0)

  // ── Alta / edición de mayorista ──
  const abrirNuevo = () => { setEditando(null); setForm(FORM_VACIO); setError(''); setModalAbierto(true) }
  const abrirEditar = (m) => {
    setEditando(m)
    setForm({ nombre: m.nombre, telefono: m.telefono || '', notas: m.notas || '', saldo_inicial: '', fecha: hoyISO() })
    setError('')
    setModalAbierto(true)
  }
  const cerrarModal = () => { setModalAbierto(false); setEditando(null); setForm(FORM_VACIO); setError('') }

  const handleGuardar = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true)
    setError('')
    try {
      if (editando) {
        await api.put(`/mayoristas/${editando.id_mayorista}`, {
          nombre: form.nombre, telefono: form.telefono, notas: form.notas,
        })
      } else {
        await api.post('/mayoristas', {
          nombre: form.nombre, telefono: form.telefono, notas: form.notas,
          saldo_inicial: form.saldo_inicial || 0, fecha: form.fecha,
        })
      }
      cerrarModal()
      cargar()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const handleBaja = async (id) => {
    try {
      await api.delete(`/mayoristas/${id}`)
      setConfirmBaja(null)
      if (detalle?.id_mayorista === id) setDetalle(null)
      cargar()
    } catch {
      alert('Error al dar de baja')
    }
  }

  // ── Panel de movimientos ──
  const abrirDetalle = async (m) => {
    setDetalle(m)
    setFormMov(FORM_MOV_VACIO)
    setErrorMov('')
    setCargandoMovs(true)
    try {
      const res = await api.get(`/mayoristas/${m.id_mayorista}/movimientos`)
      setMovimientos(res.data)
    } catch {
      setMovimientos([])
    } finally {
      setCargandoMovs(false)
    }
  }
  const cerrarDetalle = () => { setDetalle(null); setMovimientos([]) }

  const handleRegistrarMovimiento = async () => {
    const monto = parseFloat(formMov.monto)
    if (!monto || monto <= 0) { setErrorMov('El monto debe ser mayor a 0'); return }
    setGuardandoMov(true)
    setErrorMov('')
    try {
      const res = await api.post(`/mayoristas/${detalle.id_mayorista}/movimientos`, {
        tipo: formMov.tipo, monto, fecha: formMov.fecha, observaciones: formMov.observaciones,
      })
      setMovimientos(prev => [res.data, ...prev])
      const saldoNuevo = parseFloat(res.data.saldo_nuevo)
      setDetalle(prev => ({ ...prev, saldo_actual: saldoNuevo }))
      setMayoristas(prev => prev.map(m => m.id_mayorista === detalle.id_mayorista ? { ...m, saldo_actual: saldoNuevo } : m))
      setFormMov(FORM_MOV_VACIO)
    } catch (err) {
      setErrorMov(err.response?.data?.error || 'Error al registrar el movimiento')
    } finally {
      setGuardandoMov(false)
    }
  }

  const campo = (key, label, placeholder, tipo = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {tipo === 'textarea' ? (
        <textarea rows={2} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      ) : (
        <input type={tipo} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      )}
    </div>
  )

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-indigo-600">🏪</span> Crédito Mayoristas
          </h2>
          <p className="text-gray-500 text-sm mt-1">Control de cuenta corriente — cargos y abonos por mayorista</p>
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
          + Nuevo mayorista
        </button>
      </div>

      {/* Resumen */}
      {mayoristas.length > 0 && (
        <div className="mb-5 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-indigo-800">
            {mayoristas.length} mayorista{mayoristas.length !== 1 ? 's' : ''}
          </span>
          <span className="text-sm font-semibold text-indigo-900">
            Total por cobrar: {fmt(totalPorCobrar)}
          </span>
        </div>
      )}

      {/* Buscador */}
      <div className="mb-5 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input type="text" placeholder="Buscar por nombre o teléfono..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        {busqueda && (
          <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
        )}
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-center text-gray-500 py-16">Cargando...</p>
      ) : mayoristasFiltrados.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🏪</p>
          <p className="text-gray-500 font-medium">
            {busqueda ? 'Ningún resultado para esa búsqueda' : 'Todavía no hay mayoristas registrados'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mayoristasFiltrados.map(m => {
            const saldo = parseFloat(m.saldo_actual)
            return (
              <div key={m.id_mayorista} className="bg-white rounded-2xl shadow border-l-4 border-indigo-400 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-bold text-gray-900 text-base leading-tight min-w-0 truncate">{m.nombre}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    saldo > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {saldo > 0 ? 'Debe' : 'Al día'}
                  </span>
                </div>

                {m.telefono && (
                  <p className="text-sm text-gray-600 flex items-center gap-1.5 mb-0.5">
                    <span className="text-gray-400">📞</span> {m.telefono}
                  </p>
                )}
                {m.notas && <p className="text-xs text-gray-500 italic mb-2">{m.notas}</p>}

                <div className="bg-indigo-50 rounded-xl px-3 py-2 my-2">
                  <p className="text-xs font-semibold text-indigo-600 mb-0.5">Saldo actual</p>
                  <p className="text-xl font-bold text-indigo-900">{fmt(saldo)}</p>
                </div>

                <p className="text-xs text-gray-400 mb-3">
                  Últ. actualización {fechaCorta(m.updated_at)} · por {m.registrado_por?.nombre}
                </p>

                <div className="flex items-center gap-2">
                  <button onClick={() => abrirDetalle(m)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded-lg transition">
                    Ver movimientos
                  </button>
                  <button onClick={() => abrirEditar(m)} className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2">Editar</button>
                  <button onClick={() => setConfirmBaja(m.id_mayorista)} className="text-xs text-red-500 hover:text-red-700 font-medium px-1">Baja</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal alta/edición */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[95svh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-bold text-gray-800">{editando ? 'Editar mayorista' : 'Nuevo mayorista'}</h3>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {campo('nombre', 'Nombre completo', 'Ej. Comercial García')}
              {campo('telefono', 'Teléfono', 'Ej. 287 123 4567')}
              {campo('notas', 'Notas / referencia', 'Dirección, qué se le fía, etc.', 'textarea')}
              {!editando && (
                <div className="grid grid-cols-2 gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Saldo inicial (opcional)</p>
                    <p className="text-xs text-amber-600 mb-2">Si ya tiene una deuda arrastrada, captúrala aquí — queda como el primer cargo del historial.</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Monto</label>
                    <input type="number" step="0.01" min="0" value={form.saldo_inicial}
                      onChange={e => setForm(p => ({ ...p, saldo_inicial: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fecha</label>
                    <input type="date" value={form.fecha}
                      onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                      className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                  </div>
                </div>
              )}
              {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
              <button onClick={cerrarModal} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50 transition">Cancelar</button>
              <button onClick={handleGuardar} disabled={guardando}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition">
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar mayorista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar baja */}
      {confirmBaja && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <p className="text-lg font-bold text-gray-800 mb-2">¿Dar de baja?</p>
            <p className="text-gray-500 text-sm mb-6">Dejará de aparecer en la lista. Su historial de movimientos se conserva.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBaja(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-xl font-medium text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={() => handleBaja(confirmBaja)} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl font-semibold text-sm">Sí, dar de baja</button>
            </div>
          </div>
        </div>
      )}

      {/* Panel de movimientos */}
      {detalle && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[95svh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{detalle.nombre}</h3>
                <p className="text-sm text-gray-500">Saldo actual: <span className="font-semibold text-indigo-700">{fmt(detalle.saldo_actual)}</span></p>
              </div>
              <button onClick={cerrarDetalle} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
            </div>

            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700 mb-3">Registrar movimiento</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2 flex gap-2">
                  <button type="button" onClick={() => setFormMov(f => ({ ...f, tipo: 'abono' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      formMov.tipo === 'abono' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    ↓ Abono (paga)
                  </button>
                  <button type="button" onClick={() => setFormMov(f => ({ ...f, tipo: 'cargo' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      formMov.tipo === 'cargo' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    ↑ Cargo (se le fía)
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Monto</label>
                  <input type="number" step="0.01" min="0" value={formMov.monto}
                    onChange={e => setFormMov(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fecha</label>
                  <input type="date" value={formMov.fecha}
                    onChange={e => setFormMov(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Observaciones (opcional)</label>
                  <input type="text" value={formMov.observaciones}
                    onChange={e => setFormMov(f => ({ ...f, observaciones: e.target.value }))}
                    placeholder="Ej. Pago en efectivo, mercancía nueva..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              {errorMov && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 mb-2">{errorMov}</p>}
              <button onClick={handleRegistrarMovimiento} disabled={guardandoMov}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition">
                {guardandoMov ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Historial</p>
              {cargandoMovs ? (
                <p className="text-center text-gray-400 py-8 text-sm">Cargando...</p>
              ) : movimientos.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">Sin movimientos todavía</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {movimientos.map(mv => (
                    <div key={mv.id_movimiento} className="py-2.5 flex items-center gap-3">
                      <span className={`shrink-0 px-2 py-1 rounded-lg text-xs font-bold ${
                        mv.tipo === 'abono' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {mv.tipo === 'abono' ? '↓ Abono' : '↑ Cargo'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800">{fmt(mv.monto)}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {fechaCorta(mv.fecha)} · {mv.registrado_por?.nombre}
                          {mv.observaciones ? ` · ${mv.observaciones}` : ''}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 shrink-0">Saldo: {fmt(mv.saldo_nuevo)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
