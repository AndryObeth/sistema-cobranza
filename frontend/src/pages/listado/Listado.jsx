import { useState, useEffect } from 'react'
import Layout from '../../components/Layout.jsx'
import api from '../../api.js'

const fmt = n => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

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

export default function Listado() {
  const [cuentas, setCuentas]         = useState([])
  const [cargando, setCargando]       = useState(true)
  const [busqueda, setBusqueda]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [orden, setOrden]             = useState('numero_cuenta')

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
    const txt = busqueda.toLowerCase()
    const coincide =
      c.numero_cuenta?.toLowerCase().includes(txt) ||
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
      c.fecha_ultimo_pago ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX') : '',
    ])
    const csv = [encabezado, ...filas]
      .map(fila => fila.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `cuentas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
                        {c.fecha_ultimo_pago ? new Date(c.fecha_ultimo_pago).toLocaleDateString('es-MX') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmt(c.saldo_actual)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={7} className="px-4 py-3 text-sm font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{fmt(totalSaldo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
