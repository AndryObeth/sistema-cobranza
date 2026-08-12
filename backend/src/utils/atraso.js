// Cálculo de atraso real de una cuenta a partir de fechas (no de contadores manuales).
// Usado por pagos.js (al registrar un pago) y cuentas.js (barrido de recalculo y estado-cumplimiento).

const DIAS_POR_FRECUENCIA = {
  semanal:    7,
  quincenal:  15,
  mensual:    30,
  dos_meses:  60,
}

// Cuenta cuántos periodos completos de cobro (según frecuencia_pago) han vencido
// sin pago, comparando la fecha de referencia contra el próximo pago esperado.
// Da 0 si aún no vence el periodo actual (grace dentro del ciclo en curso).
function calcularSemanasAtraso({ fecha_primer_cobro, fecha_ultimo_pago, frecuencia_pago }, fechaReferencia = new Date()) {
  if (!fecha_primer_cobro) return 0

  const dias = DIAS_POR_FRECUENCIA[frecuencia_pago] || 7

  const base = fecha_ultimo_pago ? new Date(fecha_ultimo_pago) : new Date(fecha_primer_cobro)
  base.setHours(0, 0, 0, 0)

  const fechaProximo = new Date(base)
  fechaProximo.setDate(fechaProximo.getDate() + dias)

  const ref = new Date(fechaReferencia)
  ref.setHours(0, 0, 0, 0)

  const msPorDia   = 1000 * 60 * 60 * 24
  const diasAtraso = Math.round((ref - fechaProximo) / msPorDia)

  if (diasAtraso <= 0) return 0
  return Math.floor(diasAtraso / dias)
}

function calcularEstadoPorAtraso(semanas_atraso) {
  return semanas_atraso > 4 ? 'moroso' : semanas_atraso > 1 ? 'atraso' : 'activa'
}

module.exports = { DIAS_POR_FRECUENCIA, calcularSemanasAtraso, calcularEstadoPorAtraso }
