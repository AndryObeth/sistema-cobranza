// Optimización de ruta para cobranza en campo.
//
// Antes se usaba solo "vecino más cercano" (Nearest Neighbor): en cada paso
// salta al cliente más próximo. Es rápido de calcular pero deja clientes
// sueltos regados que obligan a regresar al final -> el cobrador da vueltas
// de más.
//
// Ahora: NN como semilla + 2-opt (deshace cruces de la trayectoria) + Or-opt
// (reubica corridas de 1-3 paradas a un mejor lugar). Es el enfoque estándar
// para rutas de ~50-200 paradas y corre en el teléfono en pocos ms.
//
// La ruta es ABIERTA: arranca en `origen` (donde está el cobrador) y no
// regresa al inicio.

const R = 6371 // radio terrestre en km

export function distanciaKm(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// Acepta puntos con {lat,lng} o {latitud,longitud}
const coord = (p) => ({
  lat: p.lat ?? parseFloat(p.latitud),
  lng: p.lng ?? parseFloat(p.longitud),
})

// Devuelve `puntos` reordenados para minimizar la distancia total recorrida
// arrancando desde `origen`. `puntos` puede traer cualquier metadato extra;
// solo se leen sus coordenadas.
export function optimizarRuta(puntos, origen) {
  const n = puntos.length
  if (n <= 2) return [...puntos]

  // Nodo 0 = origen; nodos 1..n = puntos[0..n-1]
  const nodos = [coord(origen), ...puntos.map(coord)]
  const D = nodos.map((a) => nodos.map((b) => distanciaKm(a, b)))
  const d = (i, j) => D[i][j] // índices en el espacio "con origen"

  // Largo de una ruta abierta origen -> ord[0] -> ord[1] -> ... (ord = índices 0..n-1)
  const largo = (ord) => {
    let s = d(0, ord[0] + 1)
    for (let i = 0; i < ord.length - 1; i++) s += d(ord[i] + 1, ord[i + 1] + 1)
    return s
  }

  // ── 1. Nearest Neighbor desde el origen ──────────────────────────────────
  const visitado = new Array(n).fill(false)
  let orden = []
  let actual = 0
  for (let k = 0; k < n; k++) {
    let best = -1
    let bestD = Infinity
    for (let j = 0; j < n; j++) {
      if (visitado[j]) continue
      const dist = d(actual, j + 1)
      if (dist < bestD) {
        bestD = dist
        best = j
      }
    }
    visitado[best] = true
    orden.push(best)
    actual = best + 1
  }

  // ── 2. 2-opt: invierte segmentos [i..j] mientras acorte ─────────────────
  // Ruta abierta: el nodo antes de i es (i-1) o el origen; el de después de j
  // es (j+1) o "nada" (fin abierto, esa arista no existe).
  const nodoPrev = (i) => (i === 0 ? 0 : orden[i - 1] + 1)
  const nodoNext = (j) => (j === orden.length - 1 ? -1 : orden[j + 1] + 1)

  let mejoro = true
  let pasadas = 0
  while (mejoro && pasadas < 40) {
    mejoro = false
    pasadas++
    for (let i = 0; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const a = nodoPrev(i)
        const b = orden[i] + 1
        const c = orden[j] + 1
        const e = nodoNext(j)
        let antes = d(a, b)
        let despues = d(a, c)
        if (e !== -1) {
          antes += d(c, e)
          despues += d(b, e)
        }
        if (despues + 1e-9 < antes) {
          let lo = i
          let hi = j
          while (lo < hi) {
            const t = orden[lo]
            orden[lo] = orden[hi]
            orden[hi] = t
            lo++
            hi--
          }
          mejoro = true
        }
      }
    }
  }

  // ── 3. Or-opt: mueve corridas de 1..3 paradas a mejor posición ──────────
  for (let segLen = 1; segLen <= 3 && segLen < orden.length; segLen++) {
    let cambio = true
    let it = 0
    while (cambio && it < 15) {
      cambio = false
      it++
      for (let i = 0; i + segLen <= orden.length; i++) {
        const seg = orden.slice(i, i + segLen)
        const resto = orden.slice(0, i).concat(orden.slice(i + segLen))
        const largoBase = largo(orden)
        let mejorK = -1
        let mejorLargo = largoBase
        let mejorRev = false
        for (let k = 0; k <= resto.length; k++) {
          if (k === i) continue // misma posición
          const rectoK = resto.slice(0, k).concat(seg, resto.slice(k))
          const Lrecto = largo(rectoK)
          if (Lrecto + 1e-9 < mejorLargo) {
            mejorLargo = Lrecto
            mejorK = k
            mejorRev = false
          }
          if (segLen > 1) {
            const revK = resto.slice(0, k).concat([...seg].reverse(), resto.slice(k))
            const Lrev = largo(revK)
            if (Lrev + 1e-9 < mejorLargo) {
              mejorLargo = Lrev
              mejorK = k
              mejorRev = true
            }
          }
        }
        if (mejorK !== -1) {
          const s = mejorRev ? [...seg].reverse() : seg
          orden = resto.slice(0, mejorK).concat(s, resto.slice(mejorK))
          cambio = true
        }
      }
    }
  }

  return orden.map((idx) => puntos[idx])
}

// Distancia total (km) de una lista de puntos ya ordenada, arrancando en origen.
export function largoRutaKm(puntosOrdenados, origen) {
  if (!puntosOrdenados.length) return 0
  let total = distanciaKm(coord(origen), coord(puntosOrdenados[0]))
  for (let i = 0; i < puntosOrdenados.length - 1; i++) {
    total += distanciaKm(coord(puntosOrdenados[i]), coord(puntosOrdenados[i + 1]))
  }
  return total
}
