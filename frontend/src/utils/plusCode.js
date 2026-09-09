import { OpenLocationCode } from 'open-location-code'

const olc = new OpenLocationCode()

// Referencia por defecto para recuperar Plus Codes cortos (de Google Maps).
// Toda la cartera de clientes está en la zona de Tuxtepec; un código corto
// de 4 caracteres es único dentro de ~40 km, así que este centro alcanza.
// Cuando hay una referencia mejor (coords del propio cliente) se usa esa.
export const CENTRO_TUXTEPEC = { lat: 18.0886, lng: -96.1342 }

export function encodePlusCode(lat, lng) {
  return olc.encode(lat, lng)
}

export function decodePlusCode(code) {
  try {
    const area = olc.decode(code)
    return { lat: area.latitudeCenter, lng: area.longitudeCenter }
  } catch {
    return null
  }
}

export function isValidPlusCode(code) {
  if (!code) return false
  const c = code.trim().toUpperCase()
  return olc.isValid(c) && olc.isFull(c)
}

// Normaliza lo que pega el usuario a un Plus Code COMPLETO, o null si no se puede.
// Acepta:
//  - código completo:            "76QX2FXQ+XX"
//  - código completo con texto:  "76QX2FXQ+XX San Juan Bautista Tuxtepec"
//  - código corto (de Google):   "XW6C+RP3 Tuxtepec, Oax."
//
// `ref` = { lat, lng } cercana para recuperar códigos cortos. Si no se pasa una
// referencia válida se usa el centro de Tuxtepec (CENTRO_TUXTEPEC) — sirve para
// toda la cartera. Si el cliente ya tiene coordenadas, pásalas como `ref` para
// que la recuperación sea exacta.
export function normalizePlusCode(input, ref) {
  if (!input) return null
  const raw = String(input).trim().toUpperCase()
  // Aísla el token del código e ignora el nombre de la localidad que suele venir pegado
  const m = raw.match(/([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})/)
  const token = m ? m[1] : raw
  const r = ref && Number.isFinite(ref.lat) && Number.isFinite(ref.lng) ? ref : CENTRO_TUXTEPEC
  try {
    if (!olc.isValid(token)) return null
    if (olc.isFull(token)) return token
    if (olc.isShort(token)) return olc.recoverNearest(token, r.lat, r.lng)
  } catch {
    return null
  }
  return null
}
