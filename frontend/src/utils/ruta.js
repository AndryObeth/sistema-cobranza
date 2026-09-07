// Optimización de ruta para cobranza en campo.
//
// Antes se usaba solo "vecino más cercano" (Nearest Neighbor): en cada paso
// salta al cliente más próximo. Es rápido pero deja clientes sueltos regados
// que obligan a regresar -> el cobrador da vueltas de más.
//
// Ahora: varias semillas NN + búsqueda local (2-opt ⇄ Or-opt) hasta que
// convergen juntas, y se queda con la mejor. 2-opt deshace los cruces de la
// trayectoria; Or-opt reubica corridas de 1-3 paradas.
//
// La ruta es ABIERTA: arranca en `origen` (donde está el cobrador) y no
// regresa al inicio.
//
// Limitación conocida: la distancia es en línea recta (Haversine), no por
// calles. Cerca del río Papaloapan dos casas en orillas opuestas quedan
// "cerca" en línea recta aunque manejar entre ellas sea largo. Sin una API
// de rutas (de pago y sin offline) no hay forma limpia de corregir eso; el
// cobrador puede reacomodar a mano las pocas paradas que queden mal.

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

// ── Búsqueda local: 2-opt + Or-opt sobre una ruta abierta ──────────────────
// `orden` = array de índices 0..n-1. `d(i,j)` = distancia entre nodos del
// espacio "con origen" (0 = origen, k+1 = punto k). Devuelve `orden` mejorado.
function busquedaLocal(orden, d) {
  let mejoroGlobal = true
  let rondas = 0
  while (mejoroGlobal && rondas < 12) {
    mejoroGlobal = false
    rondas++

    // 2-opt: invertir segmentos [i..j] mientras acorte
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
            mejoroGlobal = true
          }
        }
      }
    }

    // Or-opt: mover corridas de 1..3 paradas (recta o invertida) a mejor lugar.
    // Costo por delta (O(n²) por pasada), no recalculando la ruta completa.
    for (let segLen = 1; segLen <= 3 && segLen < orden.length; segLen++) {
      let cambio = true
      let it = 0
      while (cambio && it < 12) {
        cambio = false
        it++
        for (let i = 0; i + segLen <= orden.length; i++) {
          const s0 = orden[i] + 1
          const s1 = orden[i + segLen - 1] + 1
          const p = i === 0 ? 0 : orden[i - 1] + 1
          const q = i + segLen >= orden.length ? -1 : orden[i + segLen] + 1
          const gananciaQuitar =
            d(p, s0) + (q !== -1 ? d(s1, q) : 0) - (q !== -1 ? d(p, q) : 0)

          const resto = orden.slice(0, i).concat(orden.slice(i + segLen))
          let mejorK = -1
          let mejorDelta = -1e-9 // debe mejorar
          let mejorRev = false
          for (let k = 0; k <= resto.length; k++) {
            if (k === i) continue
            const u = k === 0 ? 0 : resto[k - 1] + 1
            const v = k >= resto.length ? -1 : resto[k] + 1
            const arUV = v !== -1 ? d(u, v) : 0
            const costoRecto = d(u, s0) + (v !== -1 ? d(s1, v) : 0) - arUV
            const deltaRecto = gananciaQuitar - costoRecto
            if (deltaRecto > mejorDelta) {
              mejorDelta = deltaRecto
              mejorK = k
              mejorRev = false
            }
            if (segLen > 1) {
              const costoRev = d(u, s1) + (v !== -1 ? d(s0, v) : 0) - arUV
              const deltaRev = gananciaQuitar - costoRev
              if (deltaRev > mejorDelta) {
                mejorDelta = deltaRev
                mejorK = k
                mejorRev = true
              }
            }
          }
          if (mejorK !== -1) {
            const seg = orden.slice(i, i + segLen)
            const s = mejorRev ? seg.reverse() : seg
            orden = resto.slice(0, mejorK).concat(s, resto.slice(mejorK))
            cambio = true
            mejoroGlobal = true
          }
        }
      }
    }
  }
  return orden
}

// Devuelve `puntos` reordenados para minimizar la distancia total recorrida
// arrancando desde `origen`. `puntos` puede traer cualquier metadato extra;
// solo se leen sus coordenadas.
export function optimizarRuta(puntos, origen) {
  const n = puntos.length
  if (n <= 2) return [...puntos]

  // Nodo 0 = origen; nodos 1..n = puntos[0..n-1]
  const nodos = [coord(origen), ...puntos.map(coord)]
  const D = nodos.map((a) => nodos.map((b) => distanciaKm(a, b)))
  const d = (i, j) => D[i][j]

  const largoTotal = (ord) => {
    let s = d(0, ord[0] + 1)
    for (let i = 0; i < ord.length - 1; i++) s += d(ord[i] + 1, ord[i + 1] + 1)
    return s
  }

  // "Regresos" bruscos: en cada tramo A→B→C, si el giro en B se acerca a 180°
  // (saliste y volviste por donde llegaste) suma una fracción de la arista más
  // corta del giro. Se usa solo para DESEMPATAR entre semillas de largo
  // parecido — así, entre dos rutas casi iguales, gana la que hace menos
  // "me pasé, tengo que regresar".
  const penalRegresos = (ord) => {
    let pen = 0
    for (let i = 0; i < ord.length - 1; i++) {
      const a = i === 0 ? 0 : ord[i - 1] + 1
      const b = ord[i] + 1
      const c = ord[i + 1] + 1
      const ab = d(a, b)
      const bc = d(b, c)
      if (ab < 1e-6 || bc < 1e-6) continue
      // ley de cosenos: cos ~ 1 => giro de 180° (regreso); cos ~ -1 => derecho
      const cos = (ab * ab + bc * bc - d(a, c) ** 2) / (2 * ab * bc)
      if (cos > 0) pen += Math.min(ab, bc) * cos
    }
    return pen
  }

  // Semillas: NN desde el origen + NN "como si" empezara en los k puntos más
  // cercanos al origen. Cada semilla da una topología distinta; la búsqueda
  // local sobre varias y quedarse con la mejor evita quedar atrapado en una
  // ruta con "regresos".
  const nn = (primero) => {
    const visitado = new Array(n).fill(false)
    const orden = []
    let actual = 0
    if (primero != null) {
      visitado[primero] = true
      orden.push(primero)
      actual = primero + 1
    }
    while (orden.length < n) {
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
    return orden
  }

  const cercanosAlOrigen = puntos
    .map((_, i) => i)
    .sort((a, b) => d(0, a + 1) - d(0, b + 1))
  const K = Math.min(4, n)
  const semillas = [nn(null), ...cercanosAlOrigen.slice(0, K).map((i) => nn(i))]

  let mejorOrden = null
  let mejorScore = Infinity
  for (const semilla of semillas) {
    const mejorada = busquedaLocal([...semilla], d)
    // score = distancia + un poco de castigo por regresos bruscos (desempate)
    const score = largoTotal(mejorada) + 0.35 * penalRegresos(mejorada)
    if (score < mejorScore) {
      mejorScore = score
      mejorOrden = mejorada
    }
  }

  return mejorOrden.map((idx) => puntos[idx])
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
