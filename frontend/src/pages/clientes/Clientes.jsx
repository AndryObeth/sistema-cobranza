import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { useAuth } from '../../context/AuthContext.jsx'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX') : '—'

const estadoCuentaColor = {
  activa:    'bg-green-100 text-green-700',
  atraso:    'bg-yellow-100 text-yellow-700',
  moroso:    'bg-red-100 text-red-700',
  liquidada: 'bg-gray-100 text-gray-500',
  cancelada: 'bg-gray-100 text-gray-400',
}

const tipoSeguimientoLabel = {
  visita:               '👁 Visita',
  promesa_pago:         '🤝 Promesa de pago',
  no_localizado:        '📵 No localizado',
  casa_cerrada:         '🚪 Casa cerrada',
  se_nego:              '❌ Se negó',
  observacion_general:  '📝 Observación',
}

const estadoClienteOpciones = ['activo', 'moroso', 'bloqueado', 'inactivo']
const nivelRiesgoOpciones   = ['', 'bajo', 'medio', 'alto']

// ─── Modal Expediente ────────────────────────────
function ModalExpediente({ cliente, onClose, usuario, onFotoUpdated }) {
  const [tab, setTab] = useState('datos')
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  const puedeEditar = usuario?.rol === 'administrador' || usuario?.rol === 'jefe_camioneta'

  const handleFotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSubiendoFoto(true)
    try {
      const formData = new FormData()
      formData.append('foto', file)
      const res = await api.post(`/uploads/fachada/${cliente.id_cliente}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onFotoUpdated?.(res.data.foto_fachada)
    } catch {
      alert('Error al subir la foto')
    } finally {
      setSubiendoFoto(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        <div className="flex items-start justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{cliente.nombre}</h2>
            <p className="text-sm text-gray-400 font-mono mt-0.5">{cliente.numero_cuenta}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="flex gap-1 px-6 pt-4 border-b">
          {[
            { id: 'datos',        label: 'Datos' },
            { id: 'compras',      label: `Compras (${cliente.ventas?.length || 0})` },
            { id: 'cuentas',      label: `Cuentas (${cliente.cuentas?.length || 0})` },
            { id: 'seguimientos', label: `Seguimientos (${cliente.seguimientos?.length || 0})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'datos' && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                { label: 'Nombre',    value: cliente.nombre },
                { label: 'Alias',     value: cliente.alias || '—' },
                { label: 'Teléfono',  value: cliente.telefono || '—' },
                { label: 'Municipio', value: cliente.municipio || '—' },
                { label: 'Colonia',   value: cliente.colonia || '—' },
                { label: 'Ruta',      value: cliente.ruta || '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="font-medium text-gray-800">{value}</p>
                </div>
              ))}
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Dirección</p>
                <p className="font-medium text-gray-800">{cliente.direccion || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Referencias</p>
                <p className="font-medium text-gray-800">{cliente.referencias || '—'}</p>
              </div>
              {cliente.observaciones_generales && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Observaciones</p>
                  <p className="text-gray-700">{cliente.observaciones_generales}</p>
                </div>
              )}

              {/* Foto de fachada */}
              {(cliente.foto_fachada || puedeEditar) && (
                <div className="col-span-2 pt-2 border-t mt-2">
                  <p className="text-xs text-gray-400 mb-2">Foto de fachada</p>
                  {cliente.foto_fachada ? (
                    <img
                      src={cliente.foto_fachada}
                      alt="Fachada"
                      className="w-full max-h-56 object-cover rounded-xl mb-3"
                    />
                  ) : (
                    <p className="text-xs text-gray-400 italic mb-3">Sin foto registrada</p>
                  )}
                  {puedeEditar && (
                    <label className={`inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer ${subiendoFoto ? 'opacity-50 pointer-events-none' : ''}`}>
                      📷 {cliente.foto_fachada ? 'Cambiar foto' : 'Agregar foto'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} disabled={subiendoFoto} />
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'compras' && (
            cliente.ventas?.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Sin compras registradas</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Folio</th>
                    <th className="text-left px-4 py-2">Fecha</th>
                    <th className="text-left px-4 py-2">Productos</th>
                    <th className="text-left px-4 py-2">Tipo / Plan</th>
                    <th className="text-right px-4 py-2">Total</th>
                    <th className="text-left px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cliente.ventas?.map(v => (
                    <tr key={v.id_venta} className={v.estatus_venta === 'liquidada' ? 'opacity-50' : ''}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{v.folio_venta}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtFecha(v.fecha_venta)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {v.detalles?.map(d => (
                          <span key={d.id_detalle_venta} className="block text-xs">{d.producto} x{d.cantidad}</span>
                        ))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${v.tipo_venta === 'contado' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {v.tipo_venta}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">{v.plan_venta?.replace(/_/g, ' ')}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(v.precio_final_total)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          v.estatus_venta === 'activa'    ? 'bg-green-100 text-green-700' :
                          v.estatus_venta === 'liquidada' ? 'bg-gray-100 text-gray-400' : 'bg-red-100 text-red-600'
                        }`}>{v.estatus_venta}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tab === 'cuentas' && (
            cliente.cuentas?.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Sin cuentas registradas</p>
            ) : (
              <div className="space-y-3">
                {cliente.cuentas?.map(c => (
                  <div key={c.id_cuenta} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-mono text-sm text-gray-500">{c.folio_cuenta}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoCuentaColor[c.estado_cuenta]}`}>
                        {c.estado_cuenta}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><p className="text-xs text-gray-400">Saldo actual</p><p className="font-bold text-gray-800 text-lg">{fmt(c.saldo_actual)}</p></div>
                      <div><p className="text-xs text-gray-400">Plan</p><p className="font-medium">{c.plan_actual?.replace(/_/g, ' ')}</p></div>
                      <div><p className="text-xs text-gray-400">Fecha límite</p><p className="font-medium">{fmtFecha(c.fecha_limite)}</p></div>
                      <div><p className="text-xs text-gray-400">Saldo inicial</p><p className="text-gray-600">{fmt(c.saldo_inicial)}</p></div>
                      <div><p className="text-xs text-gray-400">Semanas atraso</p><p className={`font-medium ${c.semanas_atraso > 0 ? 'text-red-600' : 'text-gray-600'}`}>{c.semanas_atraso}</p></div>
                      <div><p className="text-xs text-gray-400">Último pago</p><p className="text-gray-600">{fmtFecha(c.fecha_ultimo_pago)}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'seguimientos' && (
            cliente.seguimientos?.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Sin seguimientos registrados</p>
            ) : (
              <div className="space-y-3">
                {cliente.seguimientos?.map(s => (
                  <div key={s.id_seguimiento} className="border rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{tipoSeguimientoLabel[s.tipo_seguimiento] || s.tipo_seguimiento}</p>
                        {s.comentario && <p className="text-sm text-gray-500 mt-1">{s.comentario}</p>}
                      </div>
                      <div className="text-right text-xs text-gray-400 shrink-0 ml-4">
                        <p>{fmtFecha(s.fecha_registro)}</p>
                        <p className="mt-0.5">{s.usuario?.nombre}</p>
                      </div>
                    </div>
                    {s.fecha_programada && <p className="text-xs text-blue-600 mt-2">Programado: {fmtFecha(s.fecha_programada)}</p>}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Campo reutilizable ──────────────────────────
function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm'

const FORM_VACIO = {
  numero_cuenta: '',
  nombre: '', alias: '', telefono: '',
  municipio: '', colonia: '', direccion: '',
  referencias: '', ruta: '',
  estado_cliente: 'activo', nivel_riesgo: '', observaciones_generales: ''
}

// ─── Página principal ────────────────────────────
export default function Clientes() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'administrador'

  const [clientes, setClientes]             = useState([])
  const [busqueda, setBusqueda]             = useState('')
  const [cargando, setCargando]             = useState(true)
  const [modalAbierto, setModalAbierto]     = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null) // id o null
  const [clienteExpediente, setClienteExpediente] = useState(null)
  const [form, setForm]                     = useState(FORM_VACIO)
  const [guardando, setGuardando]           = useState(false)
  const [error, setError]                   = useState('')

  useEffect(() => { cargarClientes() }, [])

  const cargarClientes = async () => {
    try {
      const res = await api.get('/clientes')
      setClientes(res.data)
    } catch {
      console.error('Error al cargar clientes')
    } finally {
      setCargando(false)
    }
  }

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.numero_cuenta.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.telefono && c.telefono.includes(busqueda))
  )

  const abrirNuevo = () => {
    setClienteEditando(null)
    setForm(FORM_VACIO)
    setError('')
    setModalAbierto(true)
  }

  const abrirEdicion = (e, c) => {
    e.stopPropagation()
    setClienteEditando(c.id_cliente)
    setForm({
      numero_cuenta:           c.numero_cuenta || '',
      nombre:                  c.nombre || '',
      alias:                   c.alias || '',
      telefono:                c.telefono || '',
      municipio:               c.municipio || '',
      colonia:                 c.colonia || '',
      direccion:               c.direccion || '',
      referencias:             c.referencias || '',
      ruta:                    c.ruta || '',
      estado_cliente:          c.estado_cliente || 'activo',
      nivel_riesgo:            c.nivel_riesgo || '',
      observaciones_generales: c.observaciones_generales || ''
    })
    setError('')
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setClienteEditando(null)
    setForm(FORM_VACIO)
    setError('')
  }

  const handleGuardar = async (e) => {
    e.preventDefault()
    if (!form.numero_cuenta.trim()) { setError('El número de cuenta es obligatorio'); return }
    setGuardando(true)
    setError('')
    try {
      if (clienteEditando) {
        await api.put(`/clientes/${clienteEditando}`, form)
      } else {
        await api.post('/clientes', form)
      }
      cerrarModal()
      cargarClientes()
    } catch (err) {
      setError(err.response?.data?.error || (clienteEditando ? 'Error al actualizar cliente' : 'Error al guardar cliente'))
    } finally {
      setGuardando(false)
    }
  }

  const abrirExpediente = async (id) => {
    try {
      const res = await api.get(`/clientes/${id}`)
      setClienteExpediente(res.data)
    } catch {
      console.error('Error al cargar expediente')
    }
  }

  const estadoColor = {
    activo:    'bg-green-100 text-green-700',
    moroso:    'bg-red-100 text-red-700',
    bloqueado: 'bg-gray-100 text-gray-700',
    inactivo:  'bg-yellow-100 text-yellow-700',
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
          <p className="text-gray-500 text-sm mt-1">{clientes.length} clientes registrados</p>
        </div>
        <button onClick={abrirNuevo}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          + Nuevo cliente
        </button>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Buscar por nombre, número de cuenta o teléfono..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {cargando ? (
          <p className="text-center text-gray-500 py-12">Cargando...</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No hay clientes registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium whitespace-nowrap">Cuenta</th>
                  <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Nombre</th>
                  <th className="hidden sm:table-cell text-left px-6 py-3 text-gray-600 font-medium">Teléfono</th>
                  <th className="hidden md:table-cell text-left px-6 py-3 text-gray-600 font-medium">Municipio</th>
                  <th className="hidden sm:table-cell text-left px-6 py-3 text-gray-600 font-medium">Ruta</th>
                  <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Estado</th>
                  {esAdmin && <th className="px-4 md:px-6 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientesFiltrados.map(c => (
                  <tr key={c.id_cliente} onClick={() => abrirExpediente(c.id_cliente)}
                    className="hover:bg-blue-50 transition cursor-pointer">
                    <td className="px-4 md:px-6 py-4 font-mono text-gray-500 text-xs whitespace-nowrap">{c.numero_cuenta}</td>
                    <td className="px-4 md:px-6 py-4 font-medium text-gray-800">
                      {c.nombre}
                      {c.alias && <span className="text-gray-400 font-normal ml-2 hidden sm:inline">({c.alias})</span>}
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4 text-gray-600">{c.telefono || '—'}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-gray-600">{c.municipio || '—'}</td>
                    <td className="hidden sm:table-cell px-6 py-4 text-gray-600">{c.ruta || '—'}</td>
                    <td className="px-4 md:px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor[c.estado_cliente]}`}>
                        {c.estado_cliente}
                      </span>
                    </td>
                    {esAdmin && (
                      <td className="px-4 md:px-6 py-4 text-right">
                        <button
                          onClick={e => abrirEdicion(e, c)}
                          className="text-xs px-3 min-h-[44px] md:min-h-0 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition font-medium"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal expediente */}
      {clienteExpediente && (
        <ModalExpediente
          cliente={clienteExpediente}
          onClose={() => setClienteExpediente(null)}
          usuario={usuario}
          onFotoUpdated={(foto) => setClienteExpediente(prev => ({ ...prev, foto_fachada: foto }))}
        />
      )}

      {/* Modal nuevo / editar cliente */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  {clienteEditando ? 'Editar cliente' : 'Nuevo cliente'}
                </h3>
                {clienteEditando && !esAdmin && (
                  <p className="text-xs text-gray-400 mt-0.5">El número de cuenta no se puede modificar</p>
                )}
              </div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Campo label="Número de cuenta *">
                    <input type="text" required value={form.numero_cuenta}
                      onChange={e => setForm({...form, numero_cuenta: e.target.value})}
                      placeholder="Ej: 001, 1234, A-001"
                      disabled={clienteEditando && !esAdmin}
                      className={`${INPUT} ${clienteEditando && !esAdmin ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`} />
                  </Campo>
                </div>
                <div className="col-span-2">
                  <Campo label="Nombre completo *">
                    <input type="text" required value={form.nombre}
                      onChange={e => setForm({...form, nombre: e.target.value})} className={INPUT} />
                  </Campo>
                </div>
                <Campo label="Alias">
                  <input type="text" value={form.alias}
                    onChange={e => setForm({...form, alias: e.target.value})} className={INPUT} />
                </Campo>
                <Campo label="Teléfono">
                  <input type="text" value={form.telefono}
                    onChange={e => setForm({...form, telefono: e.target.value})} className={INPUT} />
                </Campo>
                <Campo label="Municipio">
                  <input type="text" value={form.municipio}
                    onChange={e => setForm({...form, municipio: e.target.value})} className={INPUT} />
                </Campo>
                <Campo label="Colonia">
                  <input type="text" value={form.colonia}
                    onChange={e => setForm({...form, colonia: e.target.value})} className={INPUT} />
                </Campo>
                <div className="col-span-2">
                  <Campo label="Dirección">
                    <input type="text" value={form.direccion}
                      onChange={e => setForm({...form, direccion: e.target.value})} className={INPUT} />
                  </Campo>
                </div>
                <div className="col-span-2">
                  <Campo label="Referencias">
                    <input type="text" value={form.referencias}
                      onChange={e => setForm({...form, referencias: e.target.value})} className={INPUT} />
                  </Campo>
                </div>
                <Campo label="Ruta *">
                  <input type="text" value={form.ruta} required
                    onChange={e => setForm({...form, ruta: e.target.value})}
                    placeholder="Ej: A, B, C, E"
                    className={INPUT} />
                </Campo>

                {/* Campos solo visibles en edición */}
                {clienteEditando && (
                  <>
                    <Campo label="Estado del cliente">
                      <select value={form.estado_cliente}
                        onChange={e => setForm({...form, estado_cliente: e.target.value})} className={INPUT}>
                        {estadoClienteOpciones.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </Campo>
                    <Campo label="Nivel de riesgo">
                      <select value={form.nivel_riesgo}
                        onChange={e => setForm({...form, nivel_riesgo: e.target.value})} className={INPUT}>
                        {nivelRiesgoOpciones.map(o => (
                          <option key={o} value={o}>{o || '— Sin asignar —'}</option>
                        ))}
                      </select>
                    </Campo>
                    <div className="col-span-2">
                      <Campo label="Observaciones generales">
                        <textarea value={form.observaciones_generales} rows={3}
                          onChange={e => setForm({...form, observaciones_generales: e.target.value})}
                          className={INPUT} />
                      </Campo>
                    </div>
                  </>
                )}
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={cerrarModal}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {guardando ? 'Guardando...' : clienteEditando ? 'Guardar cambios' : 'Guardar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
