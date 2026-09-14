// Decide, para una cuenta y una semana dadas, si le toca cobranza esta
// semana y en qué día — para armar la ruta semanal completa de un cobrador
// de un jalón (ver "Cargar mi semana" en Cobranza.jsx).
//
// Reglas (definidas junto con el usuario, ver sesión de diseño):
//  - Semanal: siempre entra, en su día fijo (cliente.dia_cobranza).
//  - Quincenal/mensual/cada 2 meses:
//      · Si la cuenta tiene dias_fijos_mes capturados (ej. "2 y 17"), esos
//        mandan: se revisa día por día de la semana si su día-del-mes está
//        en la lista.
//      · Si no, se calcula automático: fecha_ultimo_pago (o fecha_primer_cobro
//        si nunca ha pagado) + el intervalo de su frecuencia. Si esa fecha
//        esperada cae dentro de la semana, o ya venció, le toca.
//  - Un reagendo manual (promesa de pago con fecha_programada dentro de la
//    semana) tiene prioridad absoluta sobre cualquiera de las reglas de arriba.

export const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

// Mismos intervalos que ya se usaban en calcularCumplimiento (Cobranza.jsx)
export const DIAS_POR_FRECUENCIA = { semanal: 7, quincenal: 15, mensual: 30, dos_meses: 60 }

export function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nombreDiaSemana(fecha) {
  // getDay(): 0=domingo..6=sábado → reacomodar a DIAS_SEMANA (lunes primero)
  const idx = (fecha.getDay() + 6) % 7
  return DIAS_SEMANA[idx]
}

// Construye el arreglo de las próximas `n` fechas (Date, a medianoche local)
// empezando en `inicio` (incluido).
export function diasDeLaSemana(inicio, n = 7) {
  const dias = []
  for (let i = 0; i < n; i++) {
    const d = new Date(inicio)
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    dias.push(d)
  }
  return dias
}

// `cuenta`: objeto tal como lo devuelve /pagos/todas-cuentas (con .cliente anidado)
// `inicioSemana`/`finSemana`: Date a medianoche local
// `fechaReagendada`: Date|null — fecha_programada de una promesa_pago vigente para esta cuenta
// Devuelve: nombre de día ('lunes'..'domingo') o null si no le toca esta semana
export function diaQueLeToca(cuenta, inicioSemana, finSemana, fechaReagendada) {
  if (fechaReagendada) {
    const f = new Date(fechaReagendada)
    f.setHours(0, 0, 0, 0)
    if (f >= inicioSemana && f <= finSemana) return nombreDiaSemana(f)
  }

  const frecuencia = cuenta.frecuencia_pago || 'semanal'
  const diaBase = cuenta.cliente?.dia_cobranza || null

  if (frecuencia === 'semanal') return diaBase

  const diasFijos = cuenta.dias_fijos_mes || []
  if (diasFijos.length > 0) {
    for (const dia of diasDeLaSemana(inicioSemana, 7)) {
      if (dia > finSemana) break
      if (diasFijos.includes(dia.getDate())) return nombreDiaSemana(dia)
    }
    return null
  }

  // Automático: fecha_ultimo_pago (o fecha_primer_cobro) + intervalo
  const intervalo = DIAS_POR_FRECUENCIA[frecuencia]
  if (!intervalo) return diaBase // frecuencia desconocida, mejor mostrarla que perderla

  const baseStr = cuenta.fecha_ultimo_pago || cuenta.fecha_primer_cobro
  if (!baseStr) return diaBase // sin referencia para calcular, mejor mostrarla que perderla

  const base = new Date(baseStr)
  base.setHours(0, 0, 0, 0)
  const esperada = new Date(base)
  esperada.setDate(esperada.getDate() + intervalo)

  if (esperada <= finSemana) return diaBase || nombreDiaSemana(esperada)
  return null
}
