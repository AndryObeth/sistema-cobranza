const ALPHABET = '23456789CFGHJMPQRVWX'
const BASE = 20
const SEP = '+'
const SEP_POS = 8
const PAIR_LEN = 10
const PAIR_RES = [20.0, 1.0, 0.05, 0.0025, 0.000125]
const GRID_ROWS = 5
const GRID_COLS = 4
const GRID_SIZE = 0.000125

export function encodePlusCode(lat, lng) {
  lat = Math.min(90 - 1e-8, Math.max(-90, lat))
  while (lng < -180) lng += 360
  while (lng >= 180) lng -= 360

  let adjLat = lat + 90
  let adjLng = lng + 180
  let code = ''
  let count = 0

  while (count < PAIR_LEN) {
    const pv = PAIR_RES[Math.floor(count / 2)]
    code += ALPHABET.charAt(Math.floor(adjLat / pv))
    adjLat -= Math.floor(adjLat / pv) * pv
    code += ALPHABET.charAt(Math.floor(adjLng / pv))
    adjLng -= Math.floor(adjLng / pv) * pv
    count += 2
    if (count === SEP_POS) code += SEP
  }

  // Grid refinement (2 extra chars for precision ~2.8x3.5m)
  adjLat = (lat + 90) % GRID_SIZE
  adjLng = (lng + 180) % GRID_SIZE
  for (let i = 0; i < 2; i++) {
    const latPV = GRID_SIZE / Math.pow(GRID_ROWS, i + 1)
    const lngPV = GRID_SIZE / Math.pow(GRID_COLS, i + 1)
    const row = Math.floor(adjLat / latPV)
    const col = Math.floor(adjLng / lngPV)
    adjLat -= row * latPV
    adjLng -= col * lngPV
    code += ALPHABET.charAt(row * GRID_COLS + col)
  }

  return code
}

export function decodePlusCode(code) {
  const clean = code.toUpperCase().replace(SEP, '')
  let latLo = 0, lngLo = 0
  let i = 0

  while (i < Math.min(clean.length, PAIR_LEN)) {
    const pv = PAIR_RES[Math.floor(i / 2)]
    latLo += ALPHABET.indexOf(clean.charAt(i)) * pv
    lngLo += ALPHABET.indexOf(clean.charAt(i + 1)) * pv
    i += 2
  }

  let latCenter = latLo - 90 + PAIR_RES[PAIR_LEN / 2 - 1] / 2
  let lngCenter = lngLo - 180 + PAIR_RES[PAIR_LEN / 2 - 1] / 2

  if (clean.length > PAIR_LEN) {
    let latPV = GRID_SIZE
    let lngPV = GRID_SIZE
    for (let j = PAIR_LEN; j < clean.length; j++) {
      const idx = ALPHABET.indexOf(clean.charAt(j))
      const row = Math.floor(idx / GRID_COLS)
      const col = idx % GRID_COLS
      latPV /= GRID_ROWS
      lngPV /= GRID_COLS
      latCenter += row * latPV
      lngCenter += col * lngPV
    }
    latCenter += latPV / 2
    lngCenter += lngPV / 2
  }

  return { lat: latCenter, lng: lngCenter }
}

export function isValidPlusCode(code) {
  if (!code || !code.includes(SEP)) return false
  const clean = code.toUpperCase().replace(SEP, '')
  if (clean.length < 8) return false
  return [...clean].every(c => ALPHABET.includes(c))
}
