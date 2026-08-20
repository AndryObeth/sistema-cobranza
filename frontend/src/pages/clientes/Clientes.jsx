import { useState, useEffect, useCallback } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { encodePlusCode, decodePlusCode, isValidPlusCode } from '../../utils/plusCode.js'
import UbicacionesPanel from '../../components/UbicacionesPanel.jsx'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'

// ─── Detección de errores de ortografía en municipio/colonia ────────────────
const normalizarTexto = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

function distanciaEdicion(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

// Agrupa valores con ortografía muy parecida (typos de 1-2 letras) usando union-find
function agruparSimilares(valores) {
  const n = valores.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]))
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj }

  const normalizados = valores.map(v => normalizarTexto(v.valor))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = normalizados[i], b = normalizados[j]
      if (!a || !b) continue
      const umbral = Math.min(a.length, b.length) < 6 ? 1 : 2
      if (a === b || distanciaEdicion(a, b) <= umbral) union(i, j)
    }
  }
  const grupos = new Map()
  for (let i = 0; i < n; i++) {
    const raiz = find(i)
    if (!grupos.has(raiz)) grupos.set(raiz, [])
    grupos.get(raiz).push(valores[i])
  }
  return [...grupos.values()]
    .filter(g => g.length > 1)
    .map(g => g.sort((a, b) => b.count - a.count))
    .sort((a, b) => b.reduce((s, v) => s + v.count, 0) - a.reduce((s, v) => s + v.count, 0))
}

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

const DIAS_COBRANZA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
const LABEL_DIA_COBRANZA = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo'
}

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
            <p className="text-sm text-gray-400 font-mono mt-0.5">ID Exp. {cliente.numero_expediente}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="flex gap-1 px-6 pt-4 border-b">
          {[
            { id: 'datos',        label: 'Datos' },
            { id: 'ubicaciones',  label: 'Ubicaciones' },
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
              {cliente.plus_code && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">Plus Code</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-gray-800">{cliente.plus_code}</span>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(cliente.plus_code)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      📍 Abrir en Maps
                    </a>
                  </div>
                </div>
              )}
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
                      <div>
                        <p className="font-mono text-sm text-gray-500">{c.folio_cuenta}</p>
                        {c.numero_cuenta && (
                          <p className="text-xs text-blue-600 font-medium mt-0.5">No. cuenta: {c.numero_cuenta}</p>
                        )}
                      </div>
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

          {tab === 'ubicaciones' && (
            <UbicacionesPanel idCliente={cliente.id_cliente} puedeEditar={puedeEditar} />
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

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY

const FORM_VACIO = {
  nombre: '', alias: '', telefono: '',
  municipio: '', colonia: '', direccion: '',
  referencias: '', ruta: '', plus_code: '',
  estado_cliente: 'activo', nivel_riesgo: '', observaciones_generales: '',
  dia_cobranza: ''
}

// ─── Página principal ────────────────────────────
export default function Clientes() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'administrador'

  const [clientes, setClientes]             = useState([])
  const [filtroExp, setFiltroExp]           = useState('')
  const [filtroNombre, setFiltroNombre]     = useState('')
  const [filtroRuta, setFiltroRuta]         = useState('')
  const [cargando, setCargando]             = useState(true)
  const [modalAbierto, setModalAbierto]     = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null) // id o null
  const [clienteExpediente, setClienteExpediente] = useState(null)
  const [form, setForm]                     = useState(FORM_VACIO)
  const [guardando, setGuardando]           = useState(false)
  const [error, setError]                   = useState('')
  const [verificandoPC, setVerificandoPC]   = useState(false)
  const [previewPC, setPreviewPC]           = useState(null) // { lat, lng }

  // Asignación de día de cobranza por zona
  const [modalDia, setModalDia]             = useState(false)
  const [zonaMunicipio, setZonaMunicipio]   = useState('')
  const [zonaColonia, setZonaColonia]       = useState('')
  const [zonaDia, setZonaDia]               = useState('lunes')
  const [aplicandoDia, setAplicandoDia]     = useState(false)
  const [resultadoDia, setResultadoDia]     = useState(null)

  // Revisión de ortografía (municipio / colonia)
  const [modalOrtografia, setModalOrtografia]   = useState(false)
  const [cargandoOrtografia, setCargandoOrtografia] = useState(false)
  const [gruposMunicipio, setGruposMunicipio]   = useState([])
  const [gruposColonia, setGruposColonia]       = useState([])
  const [textosFusion, setTextosFusion]         = useState({}) // clave -> texto editable
  const [fusionandoClave, setFusionandoClave]   = useState(null)

  // Fusión manual (para casos que el detector automático no agrupa, ej. "Tuxtepec" vs "Tuxtepec Oaxaca")
  const [todosMunicipios, setTodosMunicipios]   = useState([])
  const [todasColonias, setTodasColonias]       = useState([])
  const [campoManual, setCampoManual]           = useState('municipio')
  const [seleccionManual, setSeleccionManual]   = useState(new Set())
  const [textoManual, setTextoManual]           = useState('')
  const [fusionandoManual, setFusionandoManual] = useState(false)

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

  const rutasDisponibles = [...new Set(clientes.map(c => c.ruta).filter(Boolean))].sort()

  const municipiosZona = [...new Set(clientes.map(c => c.municipio).filter(Boolean))].sort()
  const coloniasZona = [...new Set(
    clientes
      .filter(c => !zonaMunicipio || c.municipio === zonaMunicipio)
      .map(c => c.colonia)
      .filter(Boolean)
  )].sort()

  const abrirModalDia = () => {
    setZonaMunicipio('')
    setZonaColonia('')
    setZonaDia('lunes')
    setResultadoDia(null)
    setModalDia(true)
  }

  const aplicarDiaZona = async () => {
    if (!zonaMunicipio && !zonaColonia) { alert('Selecciona al menos municipio o colonia'); return }
    setAplicandoDia(true)
    setResultadoDia(null)
    try {
      const res = await api.put('/clientes/asignar-dia-lote', {
        municipio: zonaMunicipio || undefined,
        colonia: zonaColonia || undefined,
        dia_cobranza: zonaDia
      })
      setResultadoDia(res.data.actualizados)
      cargarClientes()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al asignar día de cobranza')
    } finally {
      setAplicandoDia(false)
    }
  }

  const abrirModalOrtografia = async () => {
    setModalOrtografia(true)
    setCargandoOrtografia(true)
    setSeleccionManual(new Set())
    setTextoManual('')
    try {
      const res = await api.get('/clientes/valores-distintos')
      const municipiosOrdenados = [...res.data.municipios].sort((a, b) => b.count - a.count)
      const coloniasOrdenadas   = [...res.data.colonias].sort((a, b) => b.count - a.count)
      setTodosMunicipios(municipiosOrdenados)
      setTodasColonias(coloniasOrdenadas)
      const gm = agruparSimilares(res.data.municipios)
      const gc = agruparSimilares(res.data.colonias)
      setGruposMunicipio(gm)
      setGruposColonia(gc)
      const textos = {}
      gm.forEach((g, i) => { textos[`municipio-${i}`] = g[0].valor })
      gc.forEach((g, i) => { textos[`colonia-${i}`] = g[0].valor })
      setTextosFusion(textos)
    } catch {
      alert('Error al buscar municipios/colonias parecidos')
    } finally {
      setCargandoOrtografia(false)
    }
  }

  const toggleSeleccionManual = (valor) => {
    setSeleccionManual(prev => {
      const next = new Set(prev)
      next.has(valor) ? next.delete(valor) : next.add(valor)
      return next
    })
  }

  const fusionarManual = async () => {
    const valorFinal = textoManual.trim()
    if (!valorFinal) { alert('Escribe la ortografía correcta'); return }
    if (seleccionManual.size < 2) { alert('Selecciona al menos 2 valores para fusionar'); return }
    setFusionandoManual(true)
    try {
      await api.put('/clientes/fusionar-valor', {
        campo: campoManual,
        valores_originales: [...seleccionManual],
        valor_final: valorFinal
      })
      if (campoManual === 'municipio') {
        setTodosMunicipios(prev => {
          const restantes = prev.filter(v => !seleccionManual.has(v.valor))
          const sumaSeleccion = prev.filter(v => seleccionManual.has(v.valor)).reduce((s, v) => s + v.count, 0)
          return [...restantes, { valor: valorFinal, count: sumaSeleccion }].sort((a, b) => b.count - a.count)
        })
      } else {
        setTodasColonias(prev => {
          const restantes = prev.filter(v => !seleccionManual.has(v.valor))
          const sumaSeleccion = prev.filter(v => seleccionManual.has(v.valor)).reduce((s, v) => s + v.count, 0)
          return [...restantes, { valor: valorFinal, count: sumaSeleccion }].sort((a, b) => b.count - a.count)
        })
      }
      setSeleccionManual(new Set())
      setTextoManual('')
      cargarClientes()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al fusionar')
    } finally {
      setFusionandoManual(false)
    }
  }

  const fusionarGrupo = async (campo, clave, grupo) => {
    const valorFinal = (textosFusion[clave] || '').trim()
    if (!valorFinal) { alert('Escribe la ortografía correcta'); return }
    setFusionandoClave(clave)
    try {
      await api.put('/clientes/fusionar-valor', {
        campo,
        valores_originales: grupo.map(v => v.valor),
        valor_final: valorFinal
      })
      if (campo === 'municipio') setGruposMunicipio(prev => prev.filter(g => g !== grupo))
      else setGruposColonia(prev => prev.filter(g => g !== grupo))
      cargarClientes()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al fusionar')
    } finally {
      setFusionandoClave(null)
    }
  }

  const clientesFiltrados = clientes.filter(c => {
    if (filtroExp    && !c.numero_expediente.toLowerCase().includes(filtroExp.toLowerCase())) return false
    if (filtroNombre && !c.nombre.toLowerCase().includes(filtroNombre.toLowerCase())) return false
    if (filtroRuta   && c.ruta !== filtroRuta) return false
    return true
  })

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
      nombre:                  c.nombre || '',
      alias:                   c.alias || '',
      telefono:                c.telefono || '',
      municipio:               c.municipio || '',
      colonia:                 c.colonia || '',
      direccion:               c.direccion || '',
      referencias:             c.referencias || '',
      ruta:                    c.ruta || '',
      plus_code:               c.plus_code || '',
      estado_cliente:          c.estado_cliente || 'activo',
      nivel_riesgo:            c.nivel_riesgo || '',
      observaciones_generales: c.observaciones_generales || '',
      dia_cobranza:            c.dia_cobranza || ''
    })
    setPreviewPC(null)
    setError('')
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setClienteEditando(null)
    setForm(FORM_VACIO)
    setPreviewPC(null)
    setError('')
  }

  const obtenerMiUbicacionPC = useCallback(() => {
    if (!navigator.geolocation) { alert('Tu dispositivo no soporta geolocalización'); return }
    setVerificandoPC(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      try {
        const pc = encodePlusCode(coords.latitude, coords.longitude)
        setForm(f => ({ ...f, plus_code: pc }))
        setPreviewPC({ lat: coords.latitude, lng: coords.longitude })
      } catch { alert('Error al generar Plus Code') }
      finally { setVerificandoPC(false) }
    }, () => { alert('No se pudo obtener la ubicación'); setVerificandoPC(false) },
    { enableHighAccuracy: true, timeout: 10000 })
  }, [])

  const verificarPlusCode = useCallback(() => {
    if (!form.plus_code?.trim()) return
    setVerificandoPC(true)
    try {
      const code = form.plus_code.trim().toUpperCase()
      if (!isValidPlusCode(code)) {
        alert('Plus Code no válido. Debe tener formato como: 76C97H6P+QF')
        return
      }
      const { lat, lng } = decodePlusCode(code)
      setPreviewPC({ lat, lng })
    } catch { alert('Error al verificar Plus Code') }
    finally { setVerificandoPC(false) }
  }, [form.plus_code])

  const handleGuardar = async (e) => {
    e.preventDefault()
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
          <p className="text-gray-500 text-sm mt-1">
            {clientesFiltrados.length !== clientes.length
              ? `${clientesFiltrados.length} de ${clientes.length} clientes`
              : `${clientes.length} clientes registrados`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esAdmin && (
            <>
              <button onClick={abrirModalOrtografia}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition">
                🔤 Revisar ortografía
              </button>
              <button onClick={abrirModalDia}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition">
                📅 Asignar día por zona
              </button>
            </>
          )}
          <button onClick={abrirNuevo}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            + Nuevo cliente
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="No. expediente…"
          value={filtroExp}
          onChange={e => setFiltroExp(e.target.value)}
          className="w-full sm:w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={filtroNombre}
          onChange={e => setFiltroNombre(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroRuta}
          onChange={e => setFiltroRuta(e.target.value)}
          className="w-full sm:w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las rutas</option>
          {rutasDisponibles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {(filtroExp || filtroNombre || filtroRuta) && (
          <button
            onClick={() => { setFiltroExp(''); setFiltroNombre(''); setFiltroRuta('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg whitespace-nowrap"
          >
            Limpiar
          </button>
        )}
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
                  <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium whitespace-nowrap">ID Expediente</th>
                  <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Nombre</th>
                  <th className="hidden sm:table-cell text-left px-6 py-3 text-gray-600 font-medium">Teléfono</th>
                  <th className="hidden md:table-cell text-left px-6 py-3 text-gray-600 font-medium">Municipio</th>
                  <th className="hidden sm:table-cell text-left px-6 py-3 text-gray-600 font-medium">Ruta</th>
                  <th className="hidden md:table-cell text-left px-6 py-3 text-gray-600 font-medium">Día</th>
                  <th className="text-left px-4 md:px-6 py-3 text-gray-600 font-medium">Estado</th>
                  {esAdmin && <th className="px-4 md:px-6 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientesFiltrados.map(c => (
                  <tr key={c.id_cliente} onClick={() => abrirExpediente(c.id_cliente)}
                    className="hover:bg-blue-50 transition cursor-pointer">
                    <td className="px-4 md:px-6 py-4 font-mono text-gray-500 text-xs whitespace-nowrap">{c.numero_expediente}</td>
                    <td className="px-4 md:px-6 py-4 font-medium text-gray-800">
                      {c.nombre}
                      {c.alias && <span className="text-gray-400 font-normal ml-2 hidden sm:inline">({c.alias})</span>}
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4 text-gray-600">{c.telefono || '—'}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-gray-600">{c.municipio || '—'}</td>
                    <td className="hidden sm:table-cell px-6 py-4 text-gray-600">{c.ruta || '—'}</td>
                    <td className="hidden md:table-cell px-6 py-4 text-gray-600">{LABEL_DIA_COBRANZA[c.dia_cobranza] || '—'}</td>
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
                {!clienteEditando && (
                  <p className="text-xs text-gray-400 mt-0.5">El ID Expediente se asigna automáticamente</p>
                )}
              </div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleGuardar} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

                {/* Plus Code */}
                <div className="col-span-2">
                  <Campo label="Plus Code (ubicación exacta)">
                    <div className="flex gap-2">
                      <input type="text" value={form.plus_code}
                        onChange={e => { setForm({...form, plus_code: e.target.value}); setPreviewPC(null) }}
                        placeholder="Ej: 7H6P+QF"
                        className={INPUT} />
                      <button type="button" onClick={verificarPlusCode} disabled={verificandoPC || !form.plus_code}
                        className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-40">
                        {verificandoPC ? '...' : 'Verificar'}
                      </button>
                    </div>
                    <button type="button" onClick={obtenerMiUbicacionPC} disabled={verificandoPC}
                      className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-40">
                      📍 {verificandoPC ? 'Obteniendo...' : 'Obtener mi ubicación'}
                    </button>
                    {previewPC && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                        <img
                          src={`https://maps.googleapis.com/maps/api/staticmap?center=${previewPC.lat},${previewPC.lng}&zoom=17&size=400x160&markers=color:red%7C${previewPC.lat},${previewPC.lng}&key=${GMAPS_KEY}`}
                          alt="Vista previa"
                          className="w-full"
                        />
                        <p className="text-xs text-gray-500 px-2 py-1 bg-gray-50">
                          {previewPC.lat.toFixed(6)}, {previewPC.lng.toFixed(6)}
                        </p>
                      </div>
                    )}
                  </Campo>
                </div>

                <Campo label="Ruta *">
                  <input type="text" value={form.ruta} required
                    onChange={e => setForm({...form, ruta: e.target.value})}
                    placeholder="Ej: A, B, C, E"
                    className={INPUT} />
                </Campo>

                <Campo label="Día de cobranza">
                  <select value={form.dia_cobranza}
                    onChange={e => setForm({...form, dia_cobranza: e.target.value})} className={INPUT}>
                    <option value="">— Sin asignar —</option>
                    {DIAS_COBRANZA.map(d => (
                      <option key={d} value={d}>{LABEL_DIA_COBRANZA[d]}</option>
                    ))}
                  </select>
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

      {/* Modal: asignar día de cobranza por zona */}
      {modalDia && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-bold text-gray-800">Asignar día de cobranza por zona</h3>
              <button onClick={() => setModalDia(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">
                Aplica un día de cobranza a todos los clientes activos de un municipio y/o localidad.
                Selecciona al menos uno de los dos.
              </p>
              <Campo label="Municipio">
                <select value={zonaMunicipio}
                  onChange={e => { setZonaMunicipio(e.target.value); setZonaColonia('') }} className={INPUT}>
                  <option value="">Todos</option>
                  {municipiosZona.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo label="Localidad / Colonia">
                <select value={zonaColonia}
                  onChange={e => setZonaColonia(e.target.value)} className={INPUT}>
                  <option value="">Todas</option>
                  {coloniasZona.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Día de cobranza">
                <select value={zonaDia}
                  onChange={e => setZonaDia(e.target.value)} className={INPUT}>
                  {DIAS_COBRANZA.map(d => (
                    <option key={d} value={d}>{LABEL_DIA_COBRANZA[d]}</option>
                  ))}
                </select>
              </Campo>
              {resultadoDia !== null && (
                <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  ✅ {resultadoDia} cliente(s) actualizado(s)
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalDia(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Cerrar
                </button>
                <button type="button" onClick={aplicarDiaZona} disabled={aplicandoDia}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                  {aplicandoDia ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: revisión de ortografía (municipio / colonia) */}
      {modalOrtografia && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Revisar ortografía</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Nombres parecidos que probablemente son el mismo lugar escrito distinto
                </p>
              </div>
              <button onClick={() => setModalOrtografia(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {cargandoOrtografia ? (
                <p className="text-center text-gray-500 py-8">Buscando parecidos...</p>
              ) : (
                <>
                  {gruposMunicipio.length === 0 && gruposColonia.length === 0 && (
                    <p className="text-sm text-gray-400">No se encontraron nombres muy parecidos automáticamente 🎉</p>
                  )}
                  {gruposMunicipio.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Municipios</h4>
                      <div className="space-y-3">
                        {gruposMunicipio.map((g, i) => {
                          const clave = `municipio-${i}`
                          return (
                            <div key={clave} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {g.map(v => (
                                  <span key={v.valor} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                    {v.valor} <span className="text-gray-400">({v.count})</span>
                                  </span>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <input type="text" value={textosFusion[clave] ?? ''}
                                  onChange={e => setTextosFusion({ ...textosFusion, [clave]: e.target.value })}
                                  className={INPUT} placeholder="Ortografía correcta" />
                                <button type="button" disabled={fusionandoClave === clave}
                                  onClick={() => fusionarGrupo('municipio', clave, g)}
                                  className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                                  {fusionandoClave === clave ? 'Fusionando...' : 'Fusionar'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {gruposColonia.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Localidades / Colonias</h4>
                      <div className="space-y-3">
                        {gruposColonia.map((g, i) => {
                          const clave = `colonia-${i}`
                          return (
                            <div key={clave} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {g.map(v => (
                                  <span key={v.valor} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                    {v.valor} <span className="text-gray-400">({v.count})</span>
                                  </span>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <input type="text" value={textosFusion[clave] ?? ''}
                                  onChange={e => setTextosFusion({ ...textosFusion, [clave]: e.target.value })}
                                  className={INPUT} placeholder="Ortografía correcta" />
                                <button type="button" disabled={fusionandoClave === clave}
                                  onClick={() => fusionarGrupo('colonia', clave, g)}
                                  className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                                  {fusionandoClave === clave ? 'Fusionando...' : 'Fusionar'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-5">
                    <h4 className="text-sm font-semibold text-gray-700 mb-1">Fusión manual</h4>
                    <p className="text-xs text-gray-500 mb-3">
                      Para casos que el detector automático no agrupa (ej. "Tuxtepec" y "Tuxtepec Oaxaca").
                      Elige el campo, marca los valores que son el mismo lugar y escribe la ortografía correcta.
                    </p>
                    <div className="flex gap-2 mb-3">
                      <button type="button"
                        onClick={() => { setCampoManual('municipio'); setSeleccionManual(new Set()); setTextoManual('') }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          campoManual === 'municipio' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                        }`}>
                        Municipios
                      </button>
                      <button type="button"
                        onClick={() => { setCampoManual('colonia'); setSeleccionManual(new Set()); setTextoManual('') }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          campoManual === 'colonia' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                        }`}>
                        Localidades / Colonias
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {(campoManual === 'municipio' ? todosMunicipios : todasColonias).map(v => (
                        <label key={v.valor} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={seleccionManual.has(v.valor)}
                            onChange={() => toggleSeleccionManual(v.valor)} />
                          <span className="flex-1">{v.valor}</span>
                          <span className="text-xs text-gray-400">{v.count}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <input type="text" value={textoManual}
                        onChange={e => setTextoManual(e.target.value)}
                        placeholder="Ortografía correcta"
                        className={INPUT} />
                      <button type="button" disabled={fusionandoManual}
                        onClick={fusionarManual}
                        className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                        {fusionandoManual ? 'Fusionando...' : `Fusionar (${seleccionManual.size})`}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
