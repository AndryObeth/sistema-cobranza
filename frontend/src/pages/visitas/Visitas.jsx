import { useState, useEffect, useMemo } from 'react'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'

const visitaColor = {
  promesa_pago:        'bg-green-100 text-green-700 border-green-200',
  no_localizado:       'bg-yellow-100 text-yellow-700 border-yellow-200',
  casa_cerrada:        'bg-gray-100 text-gray-600 border-gray-200',
  se_nego:             'bg-red-100 text-red-700 border-red-200',
  visita:              'bg-blue-100 text-blue-700 border-blue-200',
  observacion_general: 'bg-purple-100 text-purple-700 border-purple-200',
}

const visitaLabel = {
  promesa_pago:        'Promesa de pago',
  no_localizado:       'No localizado',
  casa_cerrada:        'Casa cerrada',
  se_nego:             'Se negó',
  visita:              'Visita',
  observacion_general: 'Observación',
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function isoFecha(d) { return d.toISOString().split('T')[0] }

function inicioSemana(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function avanzarFrecuencia(d, frecuencia) {
  const sig = new Date(d)
  if      (frecuencia === 'mensual')   sig.setMonth(sig.getMonth() + 1)
  else if (frecuencia === 'dos_meses') sig.setMonth(sig.getMonth() + 2)
  else if (frecuencia === 'quincenal') sig.setDate(sig.getDate() + 15)
  else                                  sig.setDate(sig.getDate() + 7)
  return sig
}

// Genera todas las fechas de cobro de una cuenta que caen dentro del rango [inicio, fin]
function fechasEnRango(cuenta, inicio, fin) {
  if (!cuenta.fecha_primer_cobro) return []

  const base = cuenta.fecha_ultimo_pago
    ? new Date(cuenta.fecha_ultimo_pago)
    : new Date(cuenta.fecha_primer_cobro)

  let sig = new Date(base)
  sig.setHours(0, 0, 0, 0)

  // Avanzar hasta >= inicio (límite de 500 iteraciones para seguridad)
  let i = 0
  while (sig < inicio && i < 500) {
    sig = avanzarFrecuencia(sig, cuenta.frecuencia_pago)
    i++
  }

  const result = []
  while (sig <= fin && result.length < 14) {
    result.push(isoFecha(sig))
    sig = avanzarFrecuencia(sig, cuenta.frecuencia_pago)
  }
  return result
}

const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`

export default function Visitas() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'administrador'

  const [tab, setTab] = useState('calendario')
  const [visitas, setVisitas] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCobrador, setFiltroCobrador] = useState('todos')
  const [semanaBase, setSemanaBase] = useState(() => inicioSemana(new Date()))

  useEffect(() => { cargarDatos() }, [])

  const cargarDatos = async () => {
    setCargando(true)
    const [rv, rc] = await Promise.allSettled([
      api.get(esAdmin ? '/visitas/todas-pendientes' : `/visitas/pendientes/${usuario.id}`),
      api.get('/visitas/cobros-sugeridos'),
    ])
    if (rv.status === 'fulfilled') setVisitas(rv.value.data)
    if (rc.status === 'fulfilled') setCuentas(rc.value.data)
    setCargando(false)
  }

  // Días de la semana visible
  const diasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(semanaBase)
    d.setDate(d.getDate() + i)
    return d
  }), [semanaBase])

  const finSemana = useMemo(() => {
    const d = new Date(semanaBase)
    d.setDate(d.getDate() + 6)
    d.setHours(23, 59, 59, 999)
    return d
  }, [semanaBase])

  // Cobradores únicos para el filtro (admin)
  const cobradores = useMemo(() => {
    const map = new Map()
    cuentas.forEach(c => {
      const cob = c.venta?.cobrador
      if (cob) map.set(cob.id_usuario, cob.nombre)
    })
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }))
  }, [cuentas])

  // Cuentas filtradas por cobrador
  const cuentasFiltradas = useMemo(() =>
    cuentas.filter(c =>
      filtroCobrador === 'todos' ||
      String(c.venta?.cobrador?.id_usuario) === String(filtroCobrador)
    ), [cuentas, filtroCobrador])

  // Mapa de cobros sugeridos por día ISO para la semana visible
  const cobrosporDia = useMemo(() => {
    const map = {}
    cuentasFiltradas.forEach(c => {
      const fechas = fechasEnRango(c, semanaBase, finSemana)
      fechas.forEach(f => {
        if (!map[f]) map[f] = []
        map[f].push(c)
      })
    })
    return map
  }, [cuentasFiltradas, semanaBase, finSemana])

  // Visitas manuales filtradas
  const visitasFiltradas = useMemo(() => visitas.filter(v => {
    if (filtroCobrador !== 'todos' && String(v.usuario?.id_usuario) !== String(filtroCobrador)) return false
    if (busqueda) {
      const txt = busqueda.toLowerCase()
      return v.cliente?.nombre?.toLowerCase().includes(txt) || v.usuario?.nombre?.toLowerCase().includes(txt)
    }
    return true
  }), [visitas, filtroCobrador, busqueda])

  // Visitas manuales por día ISO
  const visitasPorDia = useMemo(() => {
    const map = {}
    visitasFiltradas.forEach(v => {
      if (!v.fecha_programada) return
      const key = isoFecha(new Date(v.fecha_programada))
      if (!map[key]) map[key] = []
      map[key].push(v)
    })
    return map
  }, [visitasFiltradas])

  // Agrupación para vista lista
  const porCobrador = useMemo(() => visitasFiltradas.reduce((acc, v) => {
    const nombre = v.usuario?.nombre || 'Sin asignar'
    if (!acc[nombre]) acc[nombre] = []
    acc[nombre].push(v)
    return acc
  }, {}), [visitasFiltradas])

  const hoyISO = isoFecha(new Date())
  const semanaLabel = `${diasSemana[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} — ${diasSemana[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const totalCobrosVista = Object.values(cobrosporDia).reduce((s, arr) => s + arr.length, 0)

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Agenda</h2>
          <p className="text-gray-500 text-sm mt-1">
            {cuentas.length} cobros activos · {visitas.length} visitas pendientes
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {esAdmin && (
            <select
              value={filtroCobrador}
              onChange={e => setFiltroCobrador(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los cobradores</option>
              {cobradores.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
          <button onClick={cargarDatos}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
            Actualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('calendario')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'calendario' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          📅 Calendario
        </button>
        <button onClick={() => setTab('lista')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === 'lista' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          📋 Lista
        </button>
      </div>

      {cargando ? (
        <p className="text-center text-gray-500 py-12">Cargando...</p>
      ) : tab === 'calendario' ? (

        /* ===== CALENDARIO ===== */
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {/* Navegación de semana */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button
              onClick={() => setSemanaBase(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-500 text-lg">
              ‹
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">{semanaLabel}</p>
              <div className="flex items-center justify-center gap-3 mt-0.5">
                <span className="text-xs text-gray-400">{totalCobrosVista} cobros esta semana</span>
                <button onClick={() => setSemanaBase(inicioSemana(new Date()))}
                  className="text-xs text-blue-500 hover:underline">
                  Ir a hoy
                </button>
              </div>
            </div>
            <button
              onClick={() => setSemanaBase(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition text-gray-500 text-lg">
              ›
            </button>
          </div>

          {/* Leyenda */}
          <div className="flex gap-4 px-4 py-2 text-xs text-gray-400 border-b border-gray-50 bg-gray-50">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-teal-400 inline-block" />
              Cobro sugerido
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-400 inline-block" />
              Visita programada
            </span>
          </div>

          {/* Grid semanal */}
          <div className="overflow-x-auto">
            <div className="flex min-w-[560px]">
              {diasSemana.map((dia, idx) => {
                const key = isoFecha(dia)
                const esHoy = key === hoyISO
                const cobros = cobrosporDia[key] || []
                const visits = visitasPorDia[key] || []
                const total = cobros.length + visits.length

                return (
                  <div key={key}
                    className={`flex-1 border-r border-gray-100 last:border-0 ${esHoy ? 'bg-blue-50/60' : ''}`}>

                    {/* Cabecera del día */}
                    <div className={`text-center py-2 border-b border-gray-100 ${esHoy ? 'bg-blue-100' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">{DIAS[idx]}</p>
                      <p className={`text-xl font-bold leading-tight ${esHoy ? 'text-blue-600' : 'text-gray-700'}`}>
                        {dia.getDate()}
                      </p>
                      {total > 0
                        ? <span className="text-xs text-gray-400">{total}</span>
                        : <span className="text-xs text-transparent">0</span>
                      }
                    </div>

                    {/* Eventos */}
                    <div className="p-1 space-y-1 min-h-[100px]">
                      {cobros.map(c => (
                        <div key={c.id_cuenta}
                          className="bg-teal-50 border border-teal-200 rounded p-1.5 text-xs leading-snug">
                          <p className="font-semibold text-teal-800 truncate">{c.cliente?.nombre}</p>
                          <p className="text-teal-600 truncate">
                            {c.numero_cuenta || c.cliente?.numero_expediente}
                          </p>
                          <p className="text-teal-500 font-medium">{fmt(c.saldo_actual)}</p>
                          {c.horario_preferido && (
                            <p className="text-teal-400 truncate">{c.horario_preferido}</p>
                          )}
                        </div>
                      ))}
                      {visits.map(v => (
                        <div key={v.id_seguimiento}
                          className={`border rounded p-1.5 text-xs leading-snug ${visitaColor[v.tipo_seguimiento] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          <p className="font-semibold truncate">{v.cliente?.nombre}</p>
                          <p className="opacity-75">{visitaLabel[v.tipo_seguimiento]}</p>
                          {v.comentario && (
                            <p className="opacity-60 truncate">{v.comentario}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      ) : (

        /* ===== LISTA ===== */
        <>
          <div className="mb-4">
            <input type="text" placeholder="Buscar por cliente o cobrador..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {visitasFiltradas.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No hay visitas pendientes</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(porCobrador).map(([cobrador, items]) => {
                const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
                const manana = new Date(hoy); manana.setDate(manana.getDate() + 1)
                const esFechaHoy = (f) => { const d = new Date(f); return d >= hoy && d < manana }

                return (
                  <div key={cobrador} className="bg-white rounded-2xl shadow overflow-hidden">
                    <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>👤</span>
                        <p className="font-semibold text-gray-800">{cobrador}</p>
                      </div>
                      <span className="text-xs text-gray-500">{items.length} visita{items.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Mobile */}
                    <div className="sm:hidden divide-y divide-gray-100">
                      {items.map(v => (
                        <div key={v.id_seguimiento} className="p-4 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-gray-800">{v.cliente?.nombre}</p>
                              <p className="text-gray-400 text-xs font-mono">{v.cliente?.numero_expediente}</p>
                            </div>
                            <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium border ${visitaColor[v.tipo_seguimiento] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {visitaLabel[v.tipo_seguimiento]}
                            </span>
                          </div>
                          {v.fecha_programada && (
                            <p className={`text-sm font-medium ${esFechaHoy(v.fecha_programada) ? 'text-orange-600' : 'text-gray-600'}`}>
                              {esFechaHoy(v.fecha_programada) && '⚡ '}
                              {new Date(v.fecha_programada).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                          )}
                          {v.comentario && <p className="text-sm text-gray-500">{v.comentario}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Desktop */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Cliente</th>
                            <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Tipo</th>
                            <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Fecha programada</th>
                            <th className="text-left px-6 py-2 text-gray-500 font-medium text-xs">Comentario</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map(v => (
                            <tr key={v.id_seguimiento} className="hover:bg-gray-50 transition">
                              <td className="px-6 py-3">
                                <p className="font-medium text-gray-800">{v.cliente?.nombre}</p>
                                <p className="text-gray-400 text-xs font-mono">{v.cliente?.numero_expediente}</p>
                              </td>
                              <td className="px-6 py-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${visitaColor[v.tipo_seguimiento] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                  {visitaLabel[v.tipo_seguimiento]}
                                </span>
                              </td>
                              <td className="px-6 py-3">
                                {v.fecha_programada ? (
                                  <span className={`text-sm font-medium ${esFechaHoy(v.fecha_programada) ? 'text-orange-600' : 'text-gray-700'}`}>
                                    {esFechaHoy(v.fecha_programada) && '⚡ '}
                                    {new Date(v.fecha_programada).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                                  </span>
                                ) : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                              <td className="px-6 py-3 text-gray-600 text-sm">
                                {v.comentario || <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
