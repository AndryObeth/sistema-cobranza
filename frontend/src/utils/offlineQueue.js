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
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Sin espacio en localStorage (típicamente por una foto de comprobante
    // grande). Se sueltan las imágenes de la cola para no perder los pagos:
    // el pago/visita se sincroniza igual, solo sin comprobante adjunto.
    const sinImagenes = queue.map(op =>
      op?.datos?.comprobante_base64 ? { ...op, datos: { ...op.datos, comprobante_base64: undefined, _comprobante_descartado: true } } : op
    )
    localStorage.setItem(QUEUE_KEY, JSON.stringify(sinImagenes))
  }
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

// Envía UNA operación de la cola. Devuelve { sincronizado, error, errorEsDeRed }.
async function enviarOperacion(op) {
  try {
    if (op.tipo === 'POST_PAGO') {
      await api.post('/pagos', op.datos, { timeout: 20000 })
    } else if (op.tipo === 'POST_VISITA') {
      await api.post('/visitas', op.datos, { timeout: 20000 })
    } else if (op.tipo === 'PUT_DIA') {
      await api.put(`/clientes/${op.datos.id_cliente}/dia-cobranza`, { dia_cobranza: op.datos.dia_cobranza }, { timeout: 20000 })
    } else if (op.tipo === 'PUT_UBICACION') {
      await api.put(`/clientes/${op.datos.id_cliente}/coordenadas`, {
        latitud: op.datos.latitud, longitud: op.datos.longitud, plus_code: op.datos.plus_code
      }, { timeout: 20000 })
    } else if (op.tipo === 'UBICACION_NOMBRADA') {
      const { idCliente, editando, payload } = op.datos
      if (editando) {
        await api.put(`/clientes/${idCliente}/ubicaciones/${editando}`, payload, { timeout: 20000 })
      } else {
        await api.post(`/clientes/${idCliente}/ubicaciones`, payload, { timeout: 20000 })
      }
    }
    return { sincronizado: true, error: null, errorEsDeRed: false }
  } catch (err) {
    // Sin err.response = fallo de red/tiempo agotado (se reintentará solo).
    // Con err.response = el servidor lo rechazó de verdad (necesita revisión).
    return {
      sincronizado: false,
      error: err.response?.data?.error || 'Error de red',
      errorEsDeRed: !err.response,
    }
  }
}

// Clave para serializar: dos operaciones sobre la MISMA cuenta/cliente van una
// tras otra (evita pisarse el saldo); las de cuentas distintas van en paralelo.
function claveOrden(op) {
  return String(op.datos?.id_cuenta ?? op.datos?.id_cliente ?? op.datos?.idCliente ?? op.id)
}

// `onProgreso(hecho, total)` — para mostrar avance. `concurrencia` = cuántas
// cuentas distintas se suben a la vez.
export async function sincronizarCola(onProgreso, concurrencia = 5) {
  const pendientes = getQueue().filter(op => !op.sincronizado)
  if (pendientes.length === 0) return { sincronizados: 0, errores: 0, red: 0 }

  // Agrupar por cuenta/cliente; dentro de un grupo es secuencial, entre grupos
  // se procesan hasta `concurrencia` grupos a la vez.
  const grupos = new Map()
  for (const op of pendientes) {
    const k = claveOrden(op)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(op)
  }
  const colas = [...grupos.values()]

  const resultados = {}
  let hecho = 0
  const total = pendientes.length
  let siguiente = 0

  const worker = async () => {
    while (siguiente < colas.length) {
      const grupo = colas[siguiente++]
      for (const op of grupo) {
        const r = await enviarOperacion(op)
        resultados[op.id] = r
        hecho++
        if (onProgreso) onProgreso(hecho, total)
        // Si este grupo fallo por red, no seguir con el resto del grupo:
        // probablemente todos van a fallar y perdemos tiempo.
        if (r.errorEsDeRed) {
          for (let i = grupo.indexOf(op) + 1; i < grupo.length; i++) {
            resultados[grupo[i].id] = { sincronizado: false, error: 'Error de red', errorEsDeRed: true }
            hecho++
            if (onProgreso) onProgreso(hecho, total)
          }
          break
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrencia, colas.length) }, worker))

  // Fusionar contra la cola actual (releída) — el usuario pudo encolar más
  // mientras esto corría.
  const actual = getQueue()
  const actualizada = actual
    .map(op => resultados[op.id] ? { ...op, ...resultados[op.id] } : op)
    .filter(op => !op.sincronizado)
  saveQueue(actualizada)

  const vals = Object.values(resultados)
  return {
    sincronizados: vals.filter(r => r.sincronizado).length,
    errores:       vals.filter(r => !r.sincronizado && !r.errorEsDeRed).length,
    red:           vals.filter(r => r.errorEsDeRed).length,
  }
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
