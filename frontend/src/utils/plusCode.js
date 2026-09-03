import { OpenLocationCode } from 'open-location-code'

const olc = new OpenLocationCode()

// Centro de Tuxtepec — referencia por defecto para recuperar Plus Codes cortos
const REF_DEFECTO = { lat: 18.0886, lng: -96.1342 }

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
//  - código corto (de Google):   "2FXQ+XX Tuxtepec, Oax."  -> lo recupera usando `ref`
// `ref` = { lat, lng } cercana (la ubicación aproximada del cliente). Si no se
// pasa, usa el centro de Tuxtepec (sirve para códigos de la zona).
export function normalizePlusCode(input, ref) {
  if (!input) return null
  const raw = String(input).trim().toUpperCase()
  // Aísla el token del código e ignora el nombre de la localidad que suele venir pegado
  const m = raw.match(/([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})/)
  const token = m ? m[1] : raw
  try {
    if (!olc.isValid(token)) return null
    if (olc.isFull(token)) return token
    if (olc.isShort(token)) {
      const r = ref && Number.isFinite(ref.lat) && Number.isFinite(ref.lng) ? ref : REF_DEFECTO
      return olc.recoverNearest(token, r.lat, r.lng)
    }
  } catch {
    return null
  }
  return null
}
