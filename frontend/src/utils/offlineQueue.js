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
        await api.post('/pagos', op.datos)
      }
      // Marcar como sincronizado
      const idx = queue.findIndex(q => q.id === op.id)
      if (idx !== -1) {
        queue[idx].sincronizado = true
        queue[idx].error = null
      }
      sincronizados++
    } catch (err) {
      const idx = queue.findIndex(q => q.id === op.id)
      if (idx !== -1) queue[idx].error = err.response?.data?.error || 'Error de red'
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
