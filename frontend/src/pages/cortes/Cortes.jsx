import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api'
import Layout from '../../components/Layout'

const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)
const fmtFecha = f => f ? new Date(f).toLocaleDateString('es-MX') : '—'

// ─── badge estado ────────────────────────────────
function BadgeEstado({ estado }) {
  const colores = {
    abierto:  'bg-yellow-100 text-yellow-800',
    cerrado:  'bg-blue-100 text-blue-800',
    revisado: 'bg-purple-100 text-purple-800',
    pagado:   'bg-green-100 text-green-800',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colores[estado] || 'bg-gray-100 text-gray-700'}`}>
      {estado}
    </span>
  )
}

// ─── Modal Cerrar Corte Cobrador ─────────────────
function ModalCerrarCorte({ cobradorId, semana, onCerrar, onClose }) {
  const [totalDepositado, setTotalDepositado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [cargando, setCargando] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!totalDepositado) return
    setCargando(true)
    try {
      await api.post('/cortes/cobrador/cerrar', {
        id_cobrador: cobradorId,
        fecha_inicio: semana.semana_inicio,
        fecha_fin: semana.semana_fin,
        total_depositado: parseFloat(totalDepositado),
        observaciones
      })
      onCerrar()
    } catch (err) {
      alert('Error al cerrar corte: ' + (err.response?.data?.detalle || err.message))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Cerrar corte de cobrador</h2>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
          <p><span className="text-gray-500">Total cobrado:</span> <strong>{fmt(semana.total_cobrado)}</strong></p>
          <p><span className="text-gray-500">Comisión:</span> <strong>{fmt(semana.total_comisiones)}</strong></p>
          <p><span className="text-gray-500">Pagos:</span> <strong>{semana.cantidad_pagos}</strong></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Total depositado *</label>
            <input
              type="number"
              step="0.01"
              value={totalDepositado}
              onChange={e => setTotalDepositado(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
            {totalDepositado && (
              <p className={`text-xs mt-1 ${parseFloat(totalDepositado) < semana.total_cobrado ? 'text-red-600' : 'text-green-600'}`}>
                Diferencia: {fmt(semana.total_cobrado - parseFloat(totalDepositado))}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Opcional..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Cerrando…' : 'Cerrar corte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TAB COBRADOR ────────────────────────────────
function TabCobrador({ usuario }) {
  const [cobradores, setCobradores] = useState([])
  const [idCobrador, setIdCobrador] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)

  const esCobrador = usuario?.rol === 'cobrador'

  useEffect(() => {
    if (esCobrador) {
      setIdCobrador(usuario.id)
    } else {
      api.get('/usuarios').then(r => {
        const cobs = r.data.filter(u => u.rol === 'cobrador' && u.activo)
        setCobradores(cobs)
        if (cobs.length > 0) setIdCobrador(cobs[0].id_usuario)
      }).catch(() => {})
    }
  }, [esCobrador, usuario])

  useEffect(() => {
    if (!idCobrador) return
    setCargando(true)
    Promise.all([
      api.get(`/cortes/cobrador/resumen/${idCobrador}`),
      api.get(`/cortes/cobrador/historial/${idCobrador}`)
    ]).then(([r, h]) => {
      setResumen(r.data)
      setHistorial(h.data)
    }).catch(() => {}).finally(() => setCargando(false))
  }, [idCobrador])

  const recargar = () => {
    setModalAbierto(false)
    if (!idCobrador) return
    Promise.all([
      api.get(`/cortes/cobrador/resumen/${idCobrador}`),
      api.get(`/cortes/cobrador/historial/${idCobrador}`)
    ]).then(([r, h]) => {
      setResumen(r.data)
      setHistorial(h.data)
    }).catch(() => {})
  }

  return (
    <div className="space-y-6">
      {/* Selector de cobrador (solo admin) */}
      {!esCobrador && cobradores.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Cobrador:</label>
          <select
            value={idCobrador || ''}
            onChange={e => setIdCobrador(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {cobradores.map(c => (
              <option key={c.id_usuario} value={c.id_usuario}>{c.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {cargando && <p className="text-gray-400 text-sm">Cargando…</p>}

      {resumen && !cargando && (
        <>
          {/* Cards resumen */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">Total cobrado</p>
              <p className="text-2xl font-bold text-gray-800">{fmt(resumen.total_cobrado)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {fmtFecha(resumen.semana_inicio)} – {fmtFecha(resumen.semana_fin)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">Comisión generada (12%)</p>
              <p className="text-2xl font-bold text-green-600">{fmt(resumen.total_comisiones)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs text-gray-500 mb-1">Cantidad de pagos</p>
              <p className="text-2xl font-bold text-blue-600">{resumen.cantidad_pagos}</p>
            </div>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">Pagos de la semana</h3>
              {usuario?.rol === 'administrador' && resumen.cantidad_pagos > 0 && (
                <button
                  onClick={() => setModalAbierto(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                  ✂️ Cerrar corte
                </button>
              )}
            </div>
            {resumen.detalle.length === 0 ? (
              <p className="p-6 text-sm text-gray-400 text-center">Sin pagos esta semana</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Cliente</th>
                      <th className="text-right px-4 py-3">Monto</th>
                      <th className="text-right px-4 py-3">Comisión 12%</th>
                      <th className="text-left px-4 py-3">Fecha</th>
                      <th className="text-left px-4 py-3">Origen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resumen.detalle.map(p => (
                      <tr key={p.id_pago} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{p.cliente}</td>
                        <td className="px-4 py-3 text-right">{fmt(p.monto)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{fmt(p.comision_generada)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtFecha(p.fecha_pago)}</td>
                        <td className="px-4 py-3 capitalize text-gray-500">{p.origen_pago}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{fmt(resumen.total_cobrado)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{fmt(resumen.total_comisiones)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Historial */}
          {historial.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border">
              <h3 className="font-semibold text-gray-800 p-4 border-b">Historial de cortes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Período</th>
                      <th className="text-right px-4 py-3">Total cobrado</th>
                      <th className="text-right px-4 py-3">Depositado</th>
                      <th className="text-right px-4 py-3">Diferencia</th>
                      <th className="text-right px-4 py-3">Comisión</th>
                      <th className="text-left px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historial.map(c => (
                      <tr key={c.id_corte_cobrador} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">
                          {fmtFecha(c.fecha_inicio)} – {fmtFecha(c.fecha_fin)}
                        </td>
                        <td className="px-4 py-3 text-right">{fmt(c.total_cobrado)}</td>
                        <td className="px-4 py-3 text-right">{fmt(c.total_depositado)}</td>
                        <td className={`px-4 py-3 text-right ${parseFloat(c.diferencia) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt(c.diferencia)}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600">{fmt(c.comision_total)}</td>
                        <td className="px-4 py-3"><BadgeEstado estado={c.estado_corte} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {modalAbierto && resumen && (
        <ModalCerrarCorte
          cobradorId={idCobrador}
          semana={resumen}
          onCerrar={recargar}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </div>
  )
}

// ─── TAB VENDEDOR ────────────────────────────────
function TabVendedor() {
  const [pendientes, setPendientes] = useState([])
  const [historialPorVendedor, setHistorialPorVendedor] = useState({})
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(null) // id_vendedor que se está pagando

  const cargarPendientes = () => {
    setCargando(true)
    api.get('/cortes/vendedor/pendientes')
      .then(r => setPendientes(r.data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }

  useEffect(() => { cargarPendientes() }, [])

  const cargarHistorial = async (id_vendedor) => {
    try {
      const r = await api.get(`/cortes/vendedor/historial/${id_vendedor}`)
      setHistorialPorVendedor(prev => ({ ...prev, [id_vendedor]: r.data }))
    } catch {}
  }

  const pagarCorte = async (vendedor) => {
    if (!confirm(`¿Pagar ${fmt(vendedor.total_a_pagar)} a ${vendedor.nombre_vendedor}?`)) return
    setPagando(vendedor.id_vendedor)
    try {
      await api.post('/cortes/vendedor/pagar', {
        id_vendedor: vendedor.id_vendedor,
        tipo_corte: 'veinte',
        ids_recuperaciones: vendedor.recuperaciones.map(r => r.id_recuperacion)
      })
      cargarPendientes()
      cargarHistorial(vendedor.id_vendedor)
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detalle || err.message))
    } finally {
      setPagando(null)
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-gray-700">Enganches regados pendientes de pago</h3>

      {cargando && <p className="text-gray-400 text-sm">Cargando…</p>}

      {!cargando && pendientes.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border shadow-sm">
          Sin enganches pendientes de corte
        </div>
      )}

      {pendientes.map(v => (
        <div key={v.id_vendedor} className="bg-white rounded-xl shadow-sm border">
          {/* Encabezado vendedor */}
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <p className="font-semibold text-gray-800">{v.nombre_vendedor}</p>
              <p className="text-sm text-gray-500">
                {v.cantidad_recuperaciones} recuperación{v.cantidad_recuperaciones !== 1 ? 'es' : ''} · Total: <strong className="text-green-600">{fmt(v.total_a_pagar)}</strong>
              </p>
              {/* Jefes de grupo únicos involucrados en estas recuperaciones */}
              {(() => {
                const jefes = [...new Set(v.recuperaciones.map(r => r.jefe_camioneta).filter(Boolean))]
                return jefes.length > 0 ? (
                  <p className="text-xs text-gray-400 mt-0.5">Jefe(s): {jefes.join(', ')}</p>
                ) : null
              })()}
            </div>
            <button
              onClick={() => pagarCorte(v)}
              disabled={pagando === v.id_vendedor}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {pagando === v.id_vendedor ? 'Pagando…' : '✓ Pagar corte'}
            </button>
          </div>

          {/* Detalle recuperaciones */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Jefe de grupo</th>
                  <th className="text-right px-4 py-2">Recuperado</th>
                  <th className="text-right px-4 py-2">Com. cobrador</th>
                  <th className="text-right px-4 py-2">Neto vendedor</th>
                  <th className="text-left px-4 py-2">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {v.recuperaciones.map(r => (
                  <tr key={r.id_recuperacion} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{r.cliente}</td>
                    <td className="px-4 py-2 text-gray-500">{r.jefe_camioneta || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2 text-right">{fmt(r.monto_recuperado)}</td>
                    <td className="px-4 py-2 text-right text-orange-600">-{fmt(r.comision_cobrador)}</td>
                    <td className="px-4 py-2 text-right text-green-600 font-semibold">{fmt(r.monto_neto_vendedor)}</td>
                    <td className="px-4 py-2 text-gray-500">{fmtFecha(r.fecha_recuperacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Historial vendedores */}
      {Object.keys(historialPorVendedor).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border">
          <h3 className="font-semibold text-gray-800 p-4 border-b">Historial de cortes pagados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Vendedor</th>
                  <th className="text-left px-4 py-3">Fecha corte</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-right px-4 py-3">Total pagado</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.values(historialPorVendedor).flat().map(c => (
                  <tr key={c.id_corte_vendedor} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{c.vendedor?.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtFecha(c.fecha_corte)}</td>
                    <td className="px-4 py-3 capitalize">{c.tipo_corte}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">{fmt(c.total_pagado)}</td>
                    <td className="px-4 py-3"><BadgeEstado estado={c.estado_corte} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ────────────────────────────
export default function Cortes() {
  const { usuario } = useAuth()
  const [tab, setTab] = useState('cobrador')

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cortes y Comisiones</h1>
          <p className="text-gray-500 text-sm mt-1">Cierre semanal de cobrador y pago de comisiones a vendedores</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('cobrador')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition ${
              tab === 'cobrador' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            ✂️ Corte cobrador
          </button>
          <button
            onClick={() => setTab('vendedor')}
            className={`px-4 py-2 text-sm rounded-md font-medium transition ${
              tab === 'vendedor' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            💰 Corte vendedor
          </button>
        </div>

        {tab === 'cobrador' && <TabCobrador usuario={usuario} />}
        {tab === 'vendedor' && <TabVendedor />}
      </div>
    </Layout>
  )
}
