import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import Layout from '../../components/Layout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../api.js'
import { encodePlusCode, decodePlusCode, isValidPlusCode } from '../../utils/plusCode.js'

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
const CENTRO_TUXTEPEC = { lat: 18.0886, lng: -96.1342 }
const LIBRARIES = ['places']

const colorPorEstado = {
  activa:  'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
  atraso:  'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
  moroso:  'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
  sin_ubicacion: 'http://maps.google.com/mapfiles/ms/icons/grey-dot.png',
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
  const routerLocation = useLocation()

  const filtroSinUbicacion = new URLSearchParams(routerLocation.search).get('filtro') === 'sin_ubicacion'

  const [cuentas, setCuentas] = useState([])
  const [marcadores, setMarcadores] = useState([]) // { cuenta, latitud, longitud }
  const [seleccionado, setSeleccionado] = useState(null)
  const [rutaOrdenada, setRutaOrdenada] = useState(false)
  const [geocodificando, setGeocodificando] = useState(false)
  const [progreso, setProgreso] = useState({ total: 0, hecho: 0 })
  const [cargando, setCargando] = useState(true)

  const mapRef = useRef(null)
  const [miUbicacion, setMiUbicacion] = useState(null)
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [clienteEditandoCoords, setClienteEditandoCoords] = useState(null)
  const [toast, setToast] = useState(null)

  // Modal corrección de ubicación desde mapa
  const [modalCorreccion, setModalCorreccion] = useState(null) // cuenta object
  const [modoCorrecMapa, setModoCorrecMapa]   = useState('opciones')
  const [ubicPendienteMapa, setUbicPendienteMapa] = useState(null)
  const [ubicInputMapa, setUbicInputMapa]     = useState('')
  const [buscandoGPSMapa, setBuscandoGPSMapa] = useState(false)
  const [guardandoUbicMapa, setGuardandoUbicMapa] = useState(false)

  const mostrarToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const iniciarEdicionUbicacion = (marcador) => {
    setSeleccionado(null)
    setClienteEditandoCoords(marcador)
    setModoEdicion(true)
  }

  const cancelarEdicion = () => { setModoEdicion(false); setClienteEditandoCoords(null) }

  const abrirModalCorreccion = (cuenta) => {
    setSeleccionado(null)
    setModalCorreccion(cuenta)
    setModoCorrecMapa('opciones')
    setUbicPendienteMapa(null)
    setUbicInputMapa('')
  }

  const cerrarModalCorreccion = () => {
    setModalCorreccion(null)
    setModoCorrecMapa('opciones')
    setUbicPendienteMapa(null)
    setUbicInputMapa('')
  }

  const usarGPSMapa = () => {
    if (!navigator.geolocation) { mostrarToast('Sin soporte GPS'); return }
    setBuscandoGPSMapa(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pc = encodePlusCode(coords.latitude, coords.longitude)
        setUbicPendienteMapa({ lat: coords.latitude, lng: coords.longitude, plus_code: pc })
        setModoCorrecMapa('confirmar')
        setBuscandoGPSMapa(false)
      },
      () => { mostrarToast('No se pudo obtener GPS'); setBuscandoGPSMapa(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const usarPlusCodeMapa = () => {
    const code = ubicInputMapa.trim().toUpperCase()
    if (!isValidPlusCode(code)) { mostrarToast('Plus Code no válido'); return }
    const { lat, lng } = decodePlusCode(code)
    setUbicPendienteMapa({ lat, lng, plus_code: code })
    setModoCorrecMapa('confirmar')
  }

  const guardarUbicacionMapa = async () => {
    if (!ubicPendienteMapa || !modalCorreccion) return
    setGuardandoUbicMapa(true)
    try {
      const idCliente = modalCorreccion.cliente?.id_cliente
      await api.put(`/clientes/${idCliente}/coordenadas`, {
        latitud:   ubicPendienteMapa.lat,
        longitud:  ubicPendienteMapa.lng,
        plus_code: ubicPendienteMapa.plus_code,
      })
      setMarcadores(prev => prev.map(m =>
        m.cuenta.cliente?.id_cliente === idCliente
          ? { ...m, latitud: ubicPendienteMapa.lat, longitud: ubicPendienteMapa.lng,
              cuenta: { ...m.cuenta, cliente: { ...m.cuenta.cliente, plus_code: ubicPendienteMapa.plus_code } } }
          : m
      ))
      cerrarModalCorreccion()
      mostrarToast('Ubicación actualizada ✅')
    } catch {
      mostrarToast('Error al guardar la ubicación')
    } finally {
      setGuardandoUbicMapa(false)
    }
  }

  const handleMapClick = async (e) => {
    if (!modoEdicion || !clienteEditandoCoords) return
    const lat = e.latLng.lat()
    const lng = e.latLng.lng()
    const idCliente = clienteEditandoCoords.cuenta.cliente.id_cliente
    try {
      await api.put(`/clientes/${idCliente}/coordenadas`, { latitud: lat, longitud: lng })
      setMarcadores(prev => prev.map(m =>
        m.cuenta.cliente?.id_cliente === idCliente ? { ...m, latitud: lat, longitud: lng } : m
      ))
      setModoEdicion(false)
      setClienteEditandoCoords(null)
      mostrarToast('Ubicación actualizada correctamente')
    } catch {
      mostrarToast('Error al actualizar la ubicación')
      cancelarEdicion()
    }
  }

  const handleFotoUpload = async (file, idCliente) => {
    const formData = new FormData()
    formData.append('foto', file)
    const res = await api.post(`/uploads/fachada/${idCliente}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const foto = res.data.foto_fachada
    setSeleccionado(prev => ({
      ...prev,
      cuenta: { ...prev.cuenta, cliente: { ...prev.cuenta.cliente, foto_fachada: foto } }
    }))
    setMarcadores(prev => prev.map(m =>
      m.cuenta.cliente?.id_cliente === idCliente
        ? { ...m, cuenta: { ...m.cuenta, cliente: { ...m.cuenta.cliente, foto_fachada: foto } } }
        : m
    ))
    mostrarToast('Foto actualizada correctamente')
  }

  const puedeEditar = usuario?.rol === 'administrador' || usuario?.rol === 'jefe_camioneta'

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
      sinPlusCode: !c.cliente?.plus_code,
    })))
  }

  // Geocodificar desde el backend (evita restricciones de dominio en la API key)
  const geocodificarTodos = useCallback(async () => {
    const sinCoords = cuentas.filter(c => !c.cliente?.latitud || !c.cliente?.longitud)
    if (sinCoords.length === 0) { alert('Todos los clientes ya tienen coordenadas.'); return }

    setGeocodificando(true)
    setProgreso({ total: sinCoords.length, hecho: sinCoords.length })

    try {
      const res = await api.post('/clientes/geocodificar-lote')
      const { exitosos, fallidos, total, errores_detalle } = res.data

      // Recargar cuentas para obtener las nuevas coordenadas guardadas
      const resC = await api.get('/pagos/todas-cuentas')
      setCuentas(resC.data)
      procesarMarcadores(resC.data)

      let msg
      if (exitosos > 0) {
        msg = `✅ ${exitosos} de ${total} clientes localizados en el mapa.`
        if (fallidos.length) msg += `\n⚠️ Sin resultado: ${fallidos.slice(0, 5).join(', ')}${fallidos.length > 5 ? '...' : ''}`
      } else {
        msg = `❌ No se pudo geocodificar ningún cliente (${total} intentados).`
        if (errores_detalle?.length) {
          const primerError = errores_detalle[0]
          msg += `\n\nError de ejemplo: ${primerError.nombre} → ${primerError.status}`
          if (primerError.status === 'REQUEST_DENIED') msg += '\n→ La API key no tiene Geocoding API habilitada o tiene restricciones de IP/referrer.'
          if (primerError.status === 'ZERO_RESULTS') msg += '\n→ Las direcciones no producen resultados.'
        }
      }
      alert(msg)
    } catch (e) {
      alert(`Error: ${e.response?.data?.error || e.message}`)
    } finally {
      setGeocodificando(false)
    }
  }, [cuentas])

  const obtenerMiUbicacion = () => {
    if (!navigator.geolocation) { mostrarToast('Tu dispositivo no soporta geolocalización'); return }
    setBuscandoUbicacion(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMiUbicacion(coords)
        mapRef.current?.panTo(coords)
        setBuscandoUbicacion(false)
      },
      () => {
        mostrarToast('No se pudo obtener tu ubicación')
        setBuscandoUbicacion(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

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
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

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
          <button
            onClick={obtenerMiUbicacion}
            disabled={buscandoUbicacion}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {buscandoUbicacion ? 'Buscando…' : '🎯 Mi ubicación'}
          </button>
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
      <div className="flex gap-4 mb-3 text-xs text-gray-600 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Al corriente</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />En atraso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Moroso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />Sin ubicación precisa</span>
        {filtroSinUbicacion && (
          <button onClick={() => navigate('/mapa')} className="ml-2 text-blue-600 underline">Ver todos</button>
        )}
      </div>

      {/* Mapa */}
      <div className="relative rounded-2xl overflow-hidden shadow" style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}>
        {/* Overlay modo edición */}
        {modoEdicion && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', color: 'white', padding: '8px 16px',
            borderRadius: 8, zIndex: 10, fontSize: 13, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'none'
          }}>
            <span>Haz clic en el mapa para ubicar a <strong>{clienteEditandoCoords?.cuenta.cliente?.nombre}</strong></span>
            <button
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: 4, padding: '2px 10px', pointerEvents: 'all' }}
              onClick={cancelarEdicion}
            >Cancelar</button>
          </div>
        )}
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
            onClick={modoEdicion ? handleMapClick : undefined}
            options={{
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: true,
              draggableCursor: modoEdicion ? 'crosshair' : undefined,
            }}
          >
            {marcadores
              .filter(m => !filtroSinUbicacion || m.sinPlusCode)
              .map((m, idx) => {
                const icon = m.sinPlusCode
                  ? colorPorEstado.sin_ubicacion
                  : (colorPorEstado[m.cuenta.estado_cuenta] || colorPorEstado.activa)
                return (
                  <Marker
                    key={m.cuenta.id_cuenta}
                    position={{ lat: m.latitud, lng: m.longitud }}
                    icon={icon}
                    title={m.sinPlusCode ? 'Sin ubicación precisa — toca para corregir' : undefined}
                    label={rutaOrdenada && !m.sinPlusCode ? { text: String(idx + 1), color: 'white', fontSize: '11px', fontWeight: 'bold' } : undefined}
                    onClick={() => m.sinPlusCode ? abrirModalCorreccion(m.cuenta) : setSeleccionado(m)}
                  />
                )
              })}

            {miUbicacion && (
              <Marker
                position={miUbicacion}
                icon={{
                  url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                  scaledSize: new window.google.maps.Size(40, 40),
                }}
                title="Mi ubicación actual"
                zIndex={999}
              />
            )}

            {seleccionado && (
              <InfoWindow
                position={{ lat: seleccionado.latitud, lng: seleccionado.longitud }}
                onCloseClick={() => setSeleccionado(null)}
              >
                <div style={{ minWidth: 210, maxWidth: 240 }}>
                  {/* Foto de fachada */}
                  {seleccionado.cuenta.cliente?.foto_fachada && (
                    <img
                      src={seleccionado.cuenta.cliente.foto_fachada}
                      alt="Fachada"
                      style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }}
                    />
                  )}

                  <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px' }}>{seleccionado.cuenta.cliente?.nombre}</p>
                  <p style={{ color: '#6b7280', fontSize: 11, margin: '0 0 8px' }}>{seleccionado.cuenta.cliente?.direccion || 'Sin dirección'}</p>

                  <div style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>
                    <p>💰 Saldo: <strong>{fmt(seleccionado.cuenta.saldo_actual)}</strong></p>
                    <p>📋 Plan: {seleccionado.cuenta.plan_actual?.replace(/_/g, ' ')}</p>
                    <p>🔄 Frecuencia: {seleccionado.cuenta.frecuencia_pago?.replace(/_/g, ' ') || 'semanal'}</p>
                  </div>

                  {/* Plus Code */}
                  {seleccionado.cuenta.cliente?.plus_code ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                      <p style={{ fontSize: 10, color: '#15803d', margin: '0 0 3px', fontWeight: 600 }}>Plus Code</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#166534' }}>
                          {seleccionado.cuenta.cliente.plus_code}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(seleccionado.cuenta.cliente.plus_code)
                            mostrarToast('Plus Code copiado')
                          }}
                          style={{ fontSize: 10, background: '#dcfce7', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: '#15803d' }}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  ) : (
                    puedeEditar && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await api.put(`/clientes/${seleccionado.cuenta.cliente.id_cliente}/plus-code`, {})
                            if (res.data.plus_code) {
                              setSeleccionado(prev => ({
                                ...prev,
                                cuenta: {
                                  ...prev.cuenta,
                                  cliente: { ...prev.cuenta.cliente, plus_code: res.data.plus_code }
                                }
                              }))
                              mostrarToast('Plus Code generado: ' + res.data.plus_code)
                            } else {
                              mostrarToast('No se pudo generar Plus Code (sin coordenadas)')
                            }
                          } catch { mostrarToast('Error al generar Plus Code') }
                        }}
                        style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', width: '100%', fontSize: 11, marginBottom: 4 }}
                      >
                        🌐 Generar Plus Code
                      </button>
                    )
                  )}

                  <button
                    onClick={() => navigate('/cobranza')}
                    style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', width: '100%', fontWeight: 600, fontSize: 12, marginBottom: 6 }}
                  >
                    Registrar pago →
                  </button>

                  {puedeEditar && (
                    <>
                      <button
                        onClick={() => iniciarEdicionUbicacion(seleccionado)}
                        style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', width: '100%', fontSize: 12, marginBottom: 4 }}
                      >
                        📍 Corregir ubicación
                      </button>
                      <label style={{ display: 'block', background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', width: '100%', fontSize: 12, textAlign: 'center', boxSizing: 'border-box' }}>
                        📷 {seleccionado.cuenta.cliente?.foto_fachada ? 'Cambiar foto' : 'Agregar foto'}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files[0]
                            if (!file) return
                            try {
                              await handleFotoUpload(file, seleccionado.cuenta.cliente.id_cliente)
                            } catch {
                              mostrarToast('Error al subir la foto')
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>

      {/* Modal corrección de ubicación */}
      {modalCorreccion && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-[60] sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">{modalCorreccion.cliente?.nombre}</h3>
                <p className="text-xs text-gray-500">Corregir ubicación en mapa</p>
              </div>
              <button onClick={cerrarModalCorreccion} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {modoCorrecMapa === 'opciones' && (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={usarGPSMapa} disabled={buscandoGPSMapa}
                  className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-left hover:bg-blue-100 transition disabled:opacity-50">
                  <span className="text-2xl">🎯</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{buscandoGPSMapa ? 'Obteniendo GPS…' : 'Usar mi ubicación actual'}</p>
                    <p className="text-xs text-gray-500">Captura coordenadas GPS de tu celular</p>
                  </div>
                </button>
                <button type="button" onClick={() => setModoCorrecMapa('manual')}
                  className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-left hover:bg-gray-100 transition">
                  <span className="text-2xl">⌨️</span>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">Ingresar Plus Code</p>
                    <p className="text-xs text-gray-500">Escribe manualmente el código de ubicación</p>
                  </div>
                </button>
              </div>
            )}

            {modoCorrecMapa === 'manual' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Ingresa el Plus Code</p>
                <div className="flex gap-2">
                  <input type="text" value={ubicInputMapa} onChange={e => setUbicInputMapa(e.target.value)}
                    placeholder="Ej: 76C97H6P+QF"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={usarPlusCodeMapa}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Verificar</button>
                </div>
                <button type="button" onClick={() => setModoCorrecMapa('opciones')}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-700">← Volver</button>
              </div>
            )}

            {modoCorrecMapa === 'confirmar' && ubicPendienteMapa && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-3">
                  ¿Guardar esta ubicación para {modalCorreccion.cliente?.nombre}?
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3">
                  <p className="text-xs text-gray-500 mb-1">Plus Code</p>
                  <p className="font-mono font-bold text-blue-700 text-base">{ubicPendienteMapa.plus_code}</p>
                  <p className="text-xs text-gray-400 mt-1">{ubicPendienteMapa.lat.toFixed(6)}, {ubicPendienteMapa.lng.toFixed(6)}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setModoCorrecMapa('opciones')}
                    className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm">Cambiar</button>
                  <button type="button" onClick={guardarUbicacionMapa} disabled={guardandoUbicMapa}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    {guardandoUbicMapa ? 'Guardando…' : 'Guardar ✅'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
