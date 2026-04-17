// Implementación directa del algoritmo Open Location Code (Plus Codes)
const ALPHABET = '23456789CFGHJMPQRVWX'
const BASE = 20
const SEP = '+'
const SEP_POS = 8
const PAIR_LEN = 10
const PAIR_RES = [20.0, 1.0, 0.05, 0.0025, 0.000125]
const GRID_ROWS = 5
const GRID_COLS = 4
const GRID_SIZE = 0.000125

function clipLat(lat) { return Math.min(90, Math.max(-90, lat)) }
function normLng(lng) {
  while (lng < -180) lng += 360
  while (lng >= 180) lng -= 360
  return lng
}

export function encodePlusCode(lat, lng) {
  lat = clipLat(lat)
  lng = normLng(lng)
  if (lat === 90) lat = 90 - PAIR_RES[PAIR_LEN / 2 - 1]

  let adjLat = lat + 90
  let adjLng = lng + 180
  let code = ''
  let digitCount = 0

  while (digitCount < PAIR_LEN) {
    const pv = PAIR_RES[Math.floor(digitCount / 2)]
    let latDigit = Math.floor(adjLat / pv)
    latDigit = Math.max(0, Math.min(BASE - 1, latDigit))
    adjLat -= latDigit * pv
    code += ALPHABET.charAt(latDigit)
    digitCount++

    let lngDigit = Math.floor(adjLng / pv)
    lngDigit = Math.max(0, Math.min(BASE - 1, lngDigit))
    adjLng -= lngDigit * pv
    code += ALPHABET.charAt(lngDigit)
    digitCount++

    if (digitCount === SEP_POS) code += SEP
  }

  // Grid refinement — 2 extra chars (~3m precision)
  let gridLat = (lat + 90) % GRID_SIZE
  let gridLng = (lng + 180) % GRID_SIZE
  for (let i = 0; i < 2; i++) {
    const latPV = GRID_SIZE / (i === 0 ? GRID_ROWS : GRID_ROWS * GRID_ROWS)
    const lngPV = GRID_SIZE / (i === 0 ? GRID_COLS : GRID_COLS * GRID_COLS)
    const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(gridLat / latPV)))
    const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(gridLng / lngPV)))
    gridLat -= row * latPV
    gridLng -= col * lngPV
    code += ALPHABET.charAt(row * GRID_COLS + col)
  }

  return code
}

export function decodePlusCode(code) {
  const upper = code.toUpperCase().trim()
  const clean = upper.replace(SEP, '')

  let latLo = 0, lngLo = 0
  let i = 0
  while (i < Math.min(clean.length, PAIR_LEN)) {
    const pv = PAIR_RES[Math.floor(i / 2)]
    latLo += ALPHABET.indexOf(clean.charAt(i)) * pv
    lngLo += ALPHABET.indexOf(clean.charAt(i + 1)) * pv
    i += 2
  }

  const lastPV = PAIR_RES[Math.floor((Math.min(clean.length, PAIR_LEN) - 1) / 2)]
  let latCenter = latLo - 90 + lastPV / 2
  let lngCenter = lngLo - 180 + lastPV / 2

  if (clean.length > PAIR_LEN) {
    let latPV = GRID_SIZE
    let lngPV = GRID_SIZE
    for (let j = PAIR_LEN; j < clean.length; j++) {
      const idx = ALPHABET.indexOf(clean.charAt(j))
      if (idx < 0) break
      const row = Math.floor(idx / GRID_COLS)
      const col = idx % GRID_COLS
      latPV /= GRID_ROWS
      lngPV /= GRID_COLS
      latCenter = latLo - 90 + row * latPV
      lngCenter = lngLo - 180 + col * lngPV
    }
    latCenter += latPV / 2
    lngCenter += lngPV / 2
  }

  return { lat: latCenter, lng: lngCenter }
}

export function isValidPlusCode(code) {
  if (!code) return false
  const upper = code.toUpperCase().trim()
  // Acepta formato completo (XXXX+XX) o corto (+XX)
  if (!upper.includes(SEP)) return false
  const sepIdx = upper.indexOf(SEP)
  if (sepIdx > SEP_POS || sepIdx % 2 !== 0) return false
  const clean = upper.replace(SEP, '')
  if (clean.length < 2) return false
  return [...clean].every(c => ALPHABET.indexOf(c) >= 0)
}
