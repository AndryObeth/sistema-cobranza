import { OpenLocationCode } from 'open-location-code'

const olc = new OpenLocationCode()

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
//  - código corto (de Google):   "2FXQ+XX Tuxtepec, Oax."  -> SOLO se puede
//    recuperar si se pasa `ref` = { lat, lng } cercana (la ubicación aproximada
//    del cliente). Sin `ref` un código corto es ambiguo (puede caer a decenas de
//    km) y se rechaza (null): en ese caso el usuario debe pegar el código
//    completo o usar el GPS.
export function normalizePlusCode(input, ref) {
  if (!input) return null
  const raw = String(input).trim().toUpperCase()
  // Aísla el token del código e ignora el nombre de la localidad que suele venir pegado
  const m = raw.match(/([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})/)
  const token = m ? m[1] : raw
  const refValida = ref && Number.isFinite(ref.lat) && Number.isFinite(ref.lng)
  try {
    if (!olc.isValid(token)) return null
    if (olc.isFull(token)) return token
    if (olc.isShort(token) && refValida) {
      return olc.recoverNearest(token, ref.lat, ref.lng)
    }
  } catch {
    return null
  }
  return null
}
