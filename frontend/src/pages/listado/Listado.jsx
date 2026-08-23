import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'
import { useAuth } from '../../context/AuthContext.jsx'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

// Fecha local (no UTC) para el nombre del archivo exportado
function fechaLocalHoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PLAN_LABEL = {
  un_mes: '1 mes', dos_meses: '2 meses', tres_meses: '3 meses', largo_plazo: 'Largo plazo', contado_directo: 'Contado'
}

const ESTADO_COLOR = {
  activa:  'bg-green-100 text-green-700',
  atraso:  'bg-yellow-100 text-yellow-700',
  moroso:  'bg-red-100 text-red-700',
}

const ORDEN_OPCIONES = [
  { value: 'numero_cuenta', label: 'Número de cuenta (menor a mayor)' },
  { value: 'nombre_cliente', label: 'Nombre del cliente (A-Z)' },
  { value: 'saldo',         label: 'Saldo (mayor a menor)' },
  { value: 'ultimo_pago',   label: 'Fecha último pago' },
]

function ModalAnexar({ cuentaOrigen, todasLasCuentas, onCerrar, onExito }) {
  const [busquedaDest, setBusquedaDest]   = useState('')
  const [cuentaDestino, setCuentaDestino] = useState(null)
  const [cargando, setCargando]           = useState(false)
  const [error, setError]                 = useState('')

  const candidatas = todasLasCuentas.filter(c => {
    if (c.id_cuenta === cuentaOrigen.id_cuenta) return false
    const txt = busquedaDest.trim().toLowerCase()
    return (
      c.numero_cuenta?.toLowerCase().startsWith(txt) ||
      c.nombre_cliente?.toLowerCase().includes(txt) ||
      c.numero_expediente?.toLowerCase().includes(txt)
    )
  })

  const confirmar = async () => {
    if (!cuentaDestino) return
    setCargando(true)
    setError('')
    try {
      await api.post(`/cuentas/${cuentaOrigen.id_cuenta}/anexar`, {
        id_cuenta_destino: cuentaDestino.id_cuenta,
      })
      onExito()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al anexar cuenta')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        <div className="p-5 border-b">
          <h3 className="text-lg font-bold text-gray-800">Anexar cuenta</h3>
          <p className="text-sm text-gray-500 mt-0.5">El saldo restante se transfiere a otra cuenta y ésta queda cancelada.</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Cuenta origen */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-red-500 uppercase mb-1">Cuenta a cancelar</p>
            <p className="font-bold text-gray-800 text-lg">{cuentaOrigen.numero_cuenta}</p>
            <p className="text-gray-600 text-sm">{cuentaOrigen.nombre_cliente}</p>
            <p className="text-red-700 font-semibold mt-1">Saldo a transferir: {fmt(cuentaOrigen.saldo_actual)}</p>
          </div>

          {/* Búsqueda destino */}
          {!cuentaDestino ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar cuenta destino</label>
              <input
                type="text"
                autoFocus
                placeholder="Nombre, expediente o No. cuenta..."
                value={busquedaDest}
                onChange={e => setBusquedaDest(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {busquedaDest.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg max-h-52 overflow-y-auto">
                  {candidatas.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-4">Sin resultados</p>
                  ) : (
                    candidatas.slice(0, 20).map(c => (
                      <button
                        key={c.id_cuenta}
                        onClick={() => { setCuentaDestino(c); setBusquedaDest('') }}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b last:border-0 transition"
                      >
                        <span className="font-mono font-semibold text-blue-600 mr-2">{c.numero_cuenta}</span>
                        <span className="text-gray-700 text-sm">{c.nombre_cliente}</span>
                        <span className="text-gray-400 text-xs ml-2">{fmt(c.saldo_actual)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-600 uppercase mb-1">Cuenta destino</p>
              <p className="font-bold text-gray-800 text-lg">{cuentaDestino.numero_cuenta}</p>
              <p className="text-gray-600 text-sm">{cuentaDestino.nombre_cliente}</p>
              <p className="text-gray-500 text-sm mt-1">
                Saldo actual: {fmt(cuentaDestino.saldo_actual)} → Nuevo: {fmt(parseFloat(cuentaDestino.saldo_actual) + parseFloat(cuentaOrigen.saldo_actual))}
              </p>
              <button
                onClick={() => setCuentaDestino(null)}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                Cambiar cuenta destino
              </button>
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button
            onClick={onCerrar}
            disabled={cargando}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!cuentaDestino || cargando}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition"
          >
            {cargando ? 'Procesando...' : 'Confirmar anexo'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Listado() {
  const { usuario }                       = useAuth()
  const [cuentas, setCuentas]             = useState([])
  const [cargando, setCargando]           = useState(true)
  const [busqueda, setBusqueda]           = useState('')
  const [filtroEstado, setFiltroEstado]   = useState('')
  const [orden, setOrden]                 = useState('numero_cuenta')
  const [cuentaAnexar, setCuentaAnexar]   = useState(null)
  const [mensajeExito, setMensajeExito]   = useState('')

  const esAdmin = ['administrador', 'supervisor_cobranza'].includes(usuario?.rol)

  useEffect(() => { cargar(orden) }, [orden])

  const cargar = async (orderBy) => {
    setCargando(true)
    try {
      const res = await api.get(`/cuentas/listado-simple?orderBy=${orderBy}`)
      setCuentas(res.data)
    } finally {
      setCargando(false)
    }
  }

  const filtradas = cuentas.filter(c => {
    const txt = busqueda.trim().toLowerCase()
    const coincide =
      c.numero_cuenta?.toLowerCase().startsWith(txt) ||
      c.nombre_cliente?.toLowerCase().includes(txt) ||
      c.numero_expediente?.toLowerCase().includes(txt)
    const estado = filtroEstado ? c.estado_cuenta === filtroEstado : true
    return coincide && estado
  })

  const exportarCSV = () => {
    const encabezado = ['No. Cuenta', 'Nombre Cliente', 'No. Expediente', 'Saldo Actual', 'Plan', 'Estado', 'Último pago']
    const filas = filtradas.map(c => [
      c.numero_cuenta,
      c.nombre_cliente,
      c.numero_expediente,
      parseFloat(c.saldo_actual).toFixed(2),
      PLAN_LABEL[c.plan_actual] || c.plan_actual,
      c.estado_cuenta,
      c.fecha_ultimo_pago ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '',
    ])
    const csv = [encabezado, ...filas]
      .map(fila => fila.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `cuentas-${fechaLocalHoy()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExitoAnexar = () => {
    setCuentaAnexar(null)
    setMensajeExito('Cuenta anexada correctamente')
    cargar(orden)
    setTimeout(() => setMensajeExito(''), 4000)
  }

  const totalSaldo = filtradas.reduce((s, c) => s + parseFloat(c.saldo_actual), 0)

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Listado de cuentas</h2>
            <p className="text-gray-500 text-sm mt-1">
              {filtradas.length} cuentas · Saldo total: <span className="font-semibold text-gray-700">{fmt(totalSaldo)}</span>
            </p>
          </div>
          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            ⬇ Exportar CSV
          </button>
        </div>

        {mensajeExito && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm font-medium">
            {mensajeExito}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Buscar por nombre, expediente o No. cuenta..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="atraso">En atraso</option>
            <option value="moroso">Moroso</option>
          </select>
          <select
            value={orden}
            onChange={e => setOrden(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ORDEN_OPCIONES.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {cargando ? (
            <p className="text-center text-gray-400 py-12">Cargando...</p>
          ) : filtradas.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Sin resultados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">No. Cuenta</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Expediente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Último pago</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo</th>
                    {esAdmin && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtradas.map((c, i) => (
                    <tr key={c.numero_cuenta + i} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-blue-600">{c.numero_cuenta}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{c.nombre_cliente}</td>
                      <td className="px-4 py-3 text-gray-500">{c.numero_expediente}</td>
                      <td className="px-4 py-3 text-gray-600">{PLAN_LABEL[c.plan_actual] || c.plan_actual}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[c.estado_cuenta] || 'bg-gray-100 text-gray-600'}`}>
                          {c.estado_cuenta}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.fecha_ultimo_pago ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmt(c.saldo_actual)}</td>
                      {esAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setCuentaAnexar(c)}
                            className="text-xs text-orange-600 hover:text-orange-800 font-medium transition"
                            title="Anexar saldo a otra cuenta"
                          >
                            Anexar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={esAdmin ? 8 : 7} className="px-4 py-3 text-sm font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{fmt(totalSaldo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {cuentaAnexar && (
        <ModalAnexar
          cuentaOrigen={cuentaAnexar}
          todasLasCuentas={cuentas}
          onCerrar={() => setCuentaAnexar(null)}
          onExito={handleExitoAnexar}
        />
      )}
    </Layout>
  )
}
