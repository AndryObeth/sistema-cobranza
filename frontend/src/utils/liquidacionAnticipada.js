// Réplica en el frontend de calcularElegibilidadLiquidacionAnticipada()
// (backend/src/routes/cuentas.js) — el GET /cuentas/:id/liquidacion-anticipada
// no se cachea (depende de "hoy", no tiene sentido cachear una respuesta
// vieja), así que sin señal se calcula aquí con los mismos datos que ya trae
// el detalle de la cuenta (cacheado por la PWA vía /pagos/cuenta/:id o
// /pagos/todas-cuentas, ambos con venta.detalles.producto_rel incluido).
// Si cambia la lógica del backend, replicar el cambio aquí también.

const SEMANAS_POR_PLAN = {
  un_mes: 4,
  dos_meses: 8,
  tres_meses: 12,
  largo_plazo: 52,
}

const LABEL_PLAN = {
  un_mes: '1 mes',
  dos_meses: '2 meses',
  tres_meses: '3 meses',
  largo_plazo: 'Largo plazo',
}

const TIERS_LIQUIDACION_ANTICIPADA = ['un_mes', 'dos_meses', 'tres_meses']

function planAplicaEnDetalles(detalles, nuevoPlan) {
  if (nuevoPlan === 'largo_plazo') return true
  if (nuevoPlan === 'un_mes')      return true
  if (nuevoPlan === 'dos_meses')   return detalles.every(d => d.producto_rel?.aplica_2_meses && d.producto_rel?.precio_2_meses)
  if (nuevoPlan === 'tres_meses')  return detalles.every(d => d.producto_rel?.aplica_3_meses && d.producto_rel?.precio_3_meses)
  return false
}

function calcularPrecioNuevoPlan(detalles, nuevoPlan, precio_original_total) {
  if (nuevoPlan === 'largo_plazo') return parseFloat(precio_original_total)
  if (nuevoPlan === 'un_mes')      return parseFloat(precio_original_total) * 0.70
  if (nuevoPlan === 'dos_meses')   return detalles.reduce((s, d) => s + parseFloat(d.producto_rel?.precio_2_meses || 0) * d.cantidad, 0)
  if (nuevoPlan === 'tres_meses')  return detalles.reduce((s, d) => s + parseFloat(d.producto_rel?.precio_3_meses || 0) * d.cantidad, 0)
  return 0
}

export function calcularElegibilidadLiquidacionAnticipadaLocal(cuenta, detalles) {
  if (cuenta.plan_inicial !== 'largo_plazo' || cuenta.nivel_reestructura !== 0) {
    return { elegible: false, motivo: 'Esta cuenta no aplica: no se vendió a largo plazo desde el inicio, o ya tuvo un cambio de plan.' }
  }
  if (['liquidada', 'cancelada'].includes(cuenta.estado_cuenta)) {
    return { elegible: false, motivo: `Esta cuenta ya está ${cuenta.estado_cuenta}.` }
  }

  const semanasTranscurridas = (Date.now() - new Date(cuenta.fecha_inicio).getTime()) / (7 * 24 * 60 * 60 * 1000)

  let tier = null
  for (const candidato of TIERS_LIQUIDACION_ANTICIPADA) {
    if (semanasTranscurridas <= SEMANAS_POR_PLAN[candidato]) { tier = candidato; break }
  }
  if (!tier) {
    return { elegible: false, motivo: `Ya pasaron más de ${SEMANAS_POR_PLAN.tres_meses} semanas desde el inicio de la cuenta — fuera del rango para descuento por liquidación anticipada.` }
  }
  if (!planAplicaEnDetalles(detalles, tier)) {
    return { elegible: false, motivo: `Los productos de esta venta no tienen precio configurado para el plan de ${LABEL_PLAN[tier]}.` }
  }

  const saldoActual        = parseFloat(cuenta.saldo_actual)
  const precioConDescuento = parseFloat(calcularPrecioNuevoPlan(detalles, tier, cuenta.precio_original_total).toFixed(2))
  const descuentoMonto     = parseFloat((parseFloat(cuenta.precio_plan_actual) - precioConDescuento).toFixed(2))

  if (descuentoMonto <= 0) {
    return { elegible: false, motivo: 'No hay ahorro disponible: el precio con descuento no es menor al precio actual de la cuenta.' }
  }

  const descuento         = Math.min(descuentoMonto, saldoActual)
  const monto_a_pagar_hoy = Math.max(0, parseFloat((saldoActual - descuento).toFixed(2)))

  return {
    elegible: true,
    tier,
    tier_label: LABEL_PLAN[tier],
    semanas_transcurridas: Math.round(semanasTranscurridas * 10) / 10,
    semanas_limite: SEMANAS_POR_PLAN[tier],
    precio_original: parseFloat(cuenta.precio_plan_actual),
    precio_con_descuento: precioConDescuento,
    saldo_actual: saldoActual,
    descuento,
    monto_a_pagar_hoy,
  }
}
