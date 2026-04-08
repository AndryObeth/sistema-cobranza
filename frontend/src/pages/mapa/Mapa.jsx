import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'

const GOOGLE_API_KEY = 'AIzaSyCyxJz71a1Sxghckwxiq00PKckjbSeK0vg'
const CENTRO_TUXTEPEC = { lat: 18.0886, lng: -96.1342 }
const LIBRARIES = ['places']

const colorPorEstado = {
  activa:  'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
  atraso:  'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
  moroso:  'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
}

// Distancia en km entre dos puntos (fórmula de Haversine)
function distanciaKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// Algoritmo Nearest Neighbor para ordenar puntos
function optimizarRuta(puntos, origen) {
  if (puntos.length === 0) return []
  const restantes = [...puntos]
  const ruta = []
  let actual = origen

  while (restantes.length > 0) {
    let minDist = Infinity
    let idx = 0
    restantes.forEach((p, i) => {
      const d = distanciaKm(actual, { lat: p.latitud, lng: p.longitud })
      if (d < minDist) { minDist = d; idx = i }
    })
    const siguiente = restantes.splice(idx, 1)[0]
    ruta.push(siguiente)
    actual = { lat: siguiente.latitud, lng: siguiente.longitud }
  }
  return ruta
}

const fmt = (n) => `$${parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

export default function Mapa() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [cuentas, setCuentas] = useState([])
  const [marcadores, setMarcadores] = useState([]) // { cuenta, latitud, longitud }
  const [seleccionado, setSeleccionado] = useState(null)
  const [rutaOrdenada, setRutaOrdenada] = useState(false)
  const [geocodificando, setGeocodificando] = useState(false)
  const [progreso, setProgreso] = useState({ total: 0, hecho: 0 })
  const [cargando, setCargando] = useState(true)

  const mapRef = useRef(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_API_KEY,
    libraries: LIBRARIES,
  })

  useEffect(() => { cargarCuentas() }, [])

  const cargarCuentas = async () => {
    try {
      const res = await api.get('/pagos/todas-cuentas')
      setCuentas(res.data)
      procesarMarcadores(res.data)
    } catch {
      console.error('Error al cargar cuentas')
    } finally {
      setCargando(false)
    }
  }

  const procesarMarcadores = (data) => {
    const conCoords = data.filter(c => c.cliente?.latitud && c.cliente?.longitud)
    setMarcadores(conCoords.map(c => ({
      cuenta: c,
      latitud: parseFloat(c.cliente.latitud),
      longitud: parseFloat(c.cliente.longitud),
    })))
  }

  // Geocodificar todos los clientes sin coordenadas
  const geocodificarTodos = useCallback(async () => {
    if (!isLoaded) return
    const sinCoords = cuentas.filter(c => !c.cliente?.latitud || !c.cliente?.longitud)
    if (sinCoords.length === 0) { alert('Todos los clientes ya tienen coordenadas.'); return }

    setGeocodificando(true)
    setProgreso({ total: sinCoords.length, hecho: 0 })

    const nuevos = [...marcadores]
    let hecho = 0

    for (const cuenta of sinCoords) {
      const c = cuenta.cliente
      if (!c) continue
      const direccion = [c.direccion, c.colonia, c.municipio, 'Oaxaca, México']
        .filter(Boolean).join(', ')

      try {
        const resp = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(direccion)}&key=${GOOGLE_API_KEY}`
        )
        const data = await resp.json()
        if (data.results?.[0]) {
          const { lat, lng } = data.results[0].geometry.location
          // Guardar en BD
          await api.put(`/clientes/${c.id_cliente}/coordenadas`, { latitud: lat, longitud: lng })
          nuevos.push({ cuenta, latitud: lat, longitud: lng })
        }
      } catch {
        // ignorar errores individuales
      }
      hecho++
      setProgreso({ total: sinCoords.length, hecho })
    }

    setMarcadores(nuevos)
    setGeocodificando(false)
  }, [isLoaded, cuentas, marcadores])

  const handleOptimizar = () => {
    const conCoords = marcadores.filter(m => m.latitud && m.longitud)
    if (conCoords.length === 0) { alert('No hay clientes con coordenadas para optimizar.'); return }
    const ordenados = optimizarRuta(conCoords, CENTRO_TUXTEPEC)
    setMarcadores(ordenados)
    setRutaOrdenada(true)
    // Ajustar mapa para mostrar todos los puntos
    if (mapRef.current && window.google) {
      const bounds = new window.google.maps.LatLngBounds()
      ordenados.forEach(m => bounds.extend({ lat: m.latitud, lng: m.longitud }))
      mapRef.current.fitBounds(bounds)
    }
  }

  const sinCoordenadas = cuentas.filter(c => !c.cliente?.latitud || !c.cliente?.longitud).length

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Mapa de Ruta</h2>
          <p className="text-gray-500 text-sm mt-1">
            {marcadores.length} clientes con ubicación
            {sinCoordenadas > 0 && (
              <span className="ml-2 text-orange-600 font-medium">{sinCoordenadas} sin geocodificar</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {sinCoordenadas > 0 && (
            <button
              onClick={geocodificarTodos}
              disabled={geocodificando || !isLoaded}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {geocodificando
                ? `Geocodificando… ${progreso.hecho}/${progreso.total}`
                : `📍 Geocodificar ${sinCoordenadas} clientes`}
            </button>
          )}
          <button
            onClick={handleOptimizar}
            disabled={marcadores.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            🗺️ Optimizar ruta del día
          </button>
          {rutaOrdenada && (
            <button
              onClick={() => { setRutaOrdenada(false); procesarMarcadores(cuentas) }}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Restablecer
            </button>
          )}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mb-3 text-xs text-gray-600">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Al corriente</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />En atraso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Moroso</span>
      </div>

      {/* Mapa */}
      <div className="rounded-2xl overflow-hidden shadow" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
        {!isLoaded || cargando ? (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <p className="text-gray-400">Cargando mapa…</p>
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={CENTRO_TUXTEPEC}
            zoom={13}
            onLoad={map => { mapRef.current = map }}
            options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
          >
            {marcadores.map((m, idx) => {
              const estado = m.cuenta.estado_cuenta
              const icon = colorPorEstado[estado] || colorPorEstado.activa
              return (
                <Marker
                  key={m.cuenta.id_cuenta}
                  position={{ lat: m.latitud, lng: m.longitud }}
                  icon={icon}
                  label={rutaOrdenada ? { text: String(idx + 1), color: 'white', fontSize: '11px', fontWeight: 'bold' } : undefined}
                  onClick={() => setSeleccionado(m)}
                />
              )
            })}

            {seleccionado && (
              <InfoWindow
                position={{ lat: seleccionado.latitud, lng: seleccionado.longitud }}
                onCloseClick={() => setSeleccionado(null)}
              >
                <div style={{ minWidth: 200 }} className="text-sm">
                  <p className="font-bold text-gray-800 mb-1">{seleccionado.cuenta.cliente?.nombre}</p>
                  <p className="text-gray-500 text-xs mb-2">{seleccionado.cuenta.cliente?.direccion || 'Sin dirección'}</p>
                  <div className="space-y-1 mb-3">
                    <p className="text-gray-700">💰 Saldo: <strong>{fmt(seleccionado.cuenta.saldo_actual)}</strong></p>
                    <p className="text-gray-700">📋 Plan: {seleccionado.cuenta.plan_actual?.replace(/_/g, ' ')}</p>
                    <p className="text-gray-700">🔄 Frecuencia: {seleccionado.cuenta.frecuencia_pago?.replace(/_/g, ' ') || 'semanal'}</p>
                  </div>
                  <button
                    onClick={() => navigate('/cobranza')}
                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', width: '100%', fontWeight: 600 }}
                  >
                    Registrar pago →
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>

      {/* Lista de ruta optimizada */}
      {rutaOrdenada && marcadores.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
            <p className="text-sm font-semibold text-blue-800">Orden de visitas optimizado ({marcadores.length} paradas)</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {marcadores.map((m, idx) => (
              <div key={m.cuenta.id_cuenta} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{m.cuenta.cliente?.nombre}</p>
                  <p className="text-xs text-gray-400 truncate">{m.cuenta.cliente?.direccion || '—'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-700">{fmt(m.cuenta.saldo_actual)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    m.cuenta.estado_cuenta === 'activa'  ? 'bg-green-100 text-green-700' :
                    m.cuenta.estado_cuenta === 'atraso'  ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>{m.cuenta.estado_cuenta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  )
}
