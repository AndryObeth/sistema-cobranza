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

// ── Sincronizar la cola completa ──────────────────────────────────────────────

export async function sincronizarCola() {
  const queue = getQueue()
  const pendientes = queue.filter(op => !op.sincronizado)
  if (pendientes.length === 0) return { sincronizados: 0, errores: 0 }

  let sincronizados = 0
  let errores = 0

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
      }
      // Marcar como sincronizado
      const idx = queue.findIndex(q => q.id === op.id)
      if (idx !== -1) {
        queue[idx].sincronizado = true
        queue[idx].error = null
        queue[idx].errorEsDeRed = false
      }
      sincronizados++
    } catch (err) {
      const idx = queue.findIndex(q => q.id === op.id)
      if (idx !== -1) {
        // Sin err.response = fallo de red/tiempo agotado (se reintentará solo).
        // Con err.response = el servidor lo rechazó de verdad (necesita revisión).
        queue[idx].error = err.response?.data?.error || 'Error de red'
        queue[idx].errorEsDeRed = !err.response
      }
      errores++
    }
  }

  // Eliminar los ya sincronizados (mantener solo los con error para reintentar)
  const nueva = queue.filter(op => !op.sincronizado)
  saveQueue(nueva)

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
