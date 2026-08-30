import api from '../api.js'

const QUEUE_KEY = 'cobranza_offline_queue'

// ── Leer / escribir cola ──────────────────────────────────────────────────────

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  window.dispatchEvent(new Event('offline-queue-changed'))
}

export function queueCount() {
  return getQueue().filter(op => !op.sincronizado).length
}

// Operaciones que el servidor rechazó de verdad (no un simple fallo de red) —
// se siguen reintentando en segundo plano pero probablemente nunca se resuelvan
// solas; alguien debe revisarlas.
export function queueErrorCount() {
  return getQueue().filter(op => !op.sincronizado && op.error && !op.errorEsDeRed).length
}

// ── Agregar operación a la cola ───────────────────────────────────────────────

export function encolarPago(datos) {
  const queue = getQueue()
  const operacion = {
    id:           crypto.randomUUID(),
    tipo:         'POST_PAGO',
    datos,
    timestamp:    Date.now(),
    sincronizado: false,
    error:        null,
  }
  queue.push(operacion)
  saveQueue(queue)
  return operacion
}

export function encolarVisita(datos) {
  const queue = getQueue()
  const operacion = {
    id:           crypto.randomUUID(),
    tipo:         'POST_VISITA',
    datos,
    timestamp:    Date.now(),
    sincronizado: false,
    error:        null,
  }
  queue.push(operacion)
  saveQueue(queue)
  return operacion
}

export function encolarCambioDia(datos) {
  const queue = getQueue()
  const operacion = {
    id:           crypto.randomUUID(),
    tipo:         'PUT_DIA',
    datos, // { id_cliente, dia_cobranza }
    timestamp:    Date.now(),
    sincronizado: false,
    error:        null,
  }
  queue.push(operacion)
  saveQueue(queue)
  return operacion
}

export function encolarUbicacion(datos) {
  const queue = getQueue()
  const operacion = {
    id:           crypto.randomUUID(),
    tipo:         'PUT_UBICACION',
    datos, // { id_cliente, latitud, longitud, plus_code }
    timestamp:    Date.now(),
    sincronizado: false,
    error:        null,
  }
  queue.push(operacion)
  saveQueue(queue)
  return operacion
}

// Ubicación con etiqueta (Domicilio, Trabajo...) del panel de ubicaciones —
// distinta de encolarUbicacion(), que solo corrige lat/lng del cliente.
export function encolarUbicacionNombrada(datos) {
  const queue = getQueue()
  const operacion = {
    id:           crypto.randomUUID(),
    tipo:         'UBICACION_NOMBRADA',
    datos, // { idCliente, editando (id_ubicacion o null), payload }
    timestamp:    Date.now(),
    sincronizado: false,
    error:        null,
  }
  queue.push(operacion)
  saveQueue(queue)
  return operacion
}

// ── Sincronizar la cola completa ──────────────────────────────────────────────

export async function sincronizarCola() {
  const queue = getQueue()
  const pendientes = queue.filter(op => !op.sincronizado)
  if (pendientes.length === 0) return { sincronizados: 0, errores: 0 }

  let sincronizados = 0
  let errores = 0
  // Resultado de cada operación por id — NO se toca `queue`/localStorage
  // directamente aquí, porque el usuario puede seguir encolando pagos
  // nuevos (encolarPago, etc.) mientras este ciclo sigue en curso (cada
  // envío puede tardar hasta 10s con señal mala). Guardar solo los
  // resultados y fusionarlos al final contra la cola MÁS RECIENTE evita
  // que un `saveQueue` con una foto vieja borre esas operaciones nuevas.
  const resultados = {}

  for (const op of pendientes) {
    try {
      if (op.tipo === 'POST_PAGO') {
        await api.post('/pagos', op.datos, { timeout: 10000 })
      } else if (op.tipo === 'POST_VISITA') {
        await api.post('/visitas', op.datos, { timeout: 10000 })
      } else if (op.tipo === 'PUT_DIA') {
        await api.put(`/clientes/${op.datos.id_cliente}/dia-cobranza`, { dia_cobranza: op.datos.dia_cobranza }, { timeout: 10000 })
      } else if (op.tipo === 'PUT_UBICACION') {
        await api.put(`/clientes/${op.datos.id_cliente}/coordenadas`, {
          latitud: op.datos.latitud, longitud: op.datos.longitud, plus_code: op.datos.plus_code
        }, { timeout: 10000 })
      } else if (op.tipo === 'UBICACION_NOMBRADA') {
        const { idCliente, editando, payload } = op.datos
        if (editando) {
          await api.put(`/clientes/${idCliente}/ubicaciones/${editando}`, payload, { timeout: 10000 })
        } else {
          await api.post(`/clientes/${idCliente}/ubicaciones`, payload, { timeout: 10000 })
        }
      }
      resultados[op.id] = { sincronizado: true, error: null, errorEsDeRed: false }
      sincronizados++
    } catch (err) {
      // Sin err.response = fallo de red/tiempo agotado (se reintentará solo).
      // Con err.response = el servidor lo rechazó de verdad (necesita revisión).
      resultados[op.id] = {
        sincronizado: false,
        error: err.response?.data?.error || 'Error de red',
        errorEsDeRed: !err.response,
      }
      errores++
    }
  }

  // Fusionar los resultados contra la cola actual (releída), no contra la
  // foto de cuando empezó este ciclo — así no se pierde nada agregado mientras.
  const actual = getQueue()
  const actualizada = actual
    .map(op => resultados[op.id] ? { ...op, ...resultados[op.id] } : op)
    .filter(op => !op.sincronizado)
  saveQueue(actualizada)

  return { sincronizados, errores }
}

// ── Limpiar operaciones con error manualmente ─────────────────────────────────

export function limpiarErrores() {
  const queue = getQueue().filter(op => !op.error)
  saveQueue(queue)
}

// ── Listener de reconexión ────────────────────────────────────────────────────
// Se llama desde el componente que quiera reaccionar al evento online.
// Retorna una función para cancelar el listener.

export function onReconexion(callback) {
  const handler = async () => {
    if (navigator.onLine) {
      const resultado = await sincronizarCola()
      callback(resultado)
    }
  }
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
