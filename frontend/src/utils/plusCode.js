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
  return olc.isValid(code.trim().toUpperCase()) && olc.isFull(code.trim().toUpperCase())
}
