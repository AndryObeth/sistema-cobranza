import { renderToStaticMarkup } from 'react-dom/server'

// Ticket térmico de 58mm para el "Corte de cobrador" — impresión real vía
// window.print(), para cuando la impresora está conectada por USB/red a una
// PC con su driver de Windows instalado (oficina/administrador). Ahí un
// driver de verdad sí respeta @page { size: 58mm auto } y continúa el papel
// sin paginar.
//
// Esto es DISTINTO del botón "Compartir / RawBT" (utils/ticketCorte.js):
// ese es para cuando quien imprime es un cobrador desde su celular Android
// con la impresora emparejada a la app RawBT — ahí RawBT intercepta
// window.print() como si fuera una impresora del sistema, rasteriza la
// página a imagen y la reescala hasta dejarla ilegible, así que para ese
// caso se manda texto plano por navigator.share() en su lugar.
//
// Se renderiza con renderToStaticMarkup en una ventana emergente dedicada
// (mismo patrón que utils/ticket.js para el comprobante de pago) — nunca se
// monta dentro de la app, así que no afecta la vista en pantalla del corte.

const fmtMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0)

const fmtFechaCorta = (f) => f
  ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Mexico_City' })
  : '—'

// Mismo criterio de orden que el resto de Cortes.jsx: numérico por
// numero_cuenta ("2-D" antes que "10-D"), no alfabético.
function ordenarPorNumeroCuenta(detalle) {
  return [...detalle].sort((a, b) => (parseInt(a.numero_cuenta) || 0) - (parseInt(b.numero_cuenta) || 0))
}

export default function TicketCorteCobrador({
  nombreCobrador, semanaInicio, semanaFin, totalCobrado, totalComisiones, cantidadPagos, detalle,
}) {
  const neto = (parseFloat(totalCobrado) || 0) - (parseFloat(totalComisiones) || 0)
  const filas = ordenarPorNumeroCuenta(detalle || [])
  const ahora = new Date()

  return (
    <div className="ticket">
      <div className="center">
        <div className="marca">NOVEDADES CANCÚN</div>
        <div className="titulo">CORTE DE COBRADOR</div>
        <div className="bold">{nombreCobrador}</div>
        <div>{fmtFechaCorta(semanaInicio)} – {fmtFechaCorta(semanaFin)}</div>
      </div>

      {filas.map(p => (
        <div className="cobro" key={p.id_pago}>
          <div className="cliente">{p.cliente}</div>
          <div className="fila">
            <span>Cta: {p.numero_cuenta || '—'}</span>
            <span>{fmtMXN(p.monto)}</span>
          </div>
        </div>
      ))}

      <div className="totales">
        <div className="fila total-cobrado"><span>Total cobrado</span><span>{fmtMXN(totalCobrado)}</span></div>
        <div className="fila"><span>Comisión (12%)</span><span>{fmtMXN(totalComisiones)}</span></div>
        <div className="fila bold"><span>Neto a entregar</span><span>{fmtMXN(neto)}</span></div>
      </div>

      <div className="pie">
        <div className="center">{cantidadPagos} cobro{cantidadPagos === 1 ? '' : 's'}</div>
        <div className="center">
          Impreso: {fmtFechaCorta(ahora)} {ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}
        </div>
      </div>

      <div className="firma center">Firma cobrador: ____________________</div>

      <div className="espacio-final" />
    </div>
  )
}

// CSS de la ficha — todo en negro puro, sin grises/fondos/sombras/bordes
// redondeados; la jerarquía se marca con bold, nunca con color.
const ESTILOS = `
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  .ticket {
    width: 48mm;
    margin: 0 auto;
    padding: 2mm 0;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.25;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .marca { font-weight: bold; font-size: 13px; }
  .titulo { font-weight: bold; margin: 1mm 0 2mm; }
  .fila { display: flex; justify-content: space-between; gap: 2mm; }
  .cobro { border-top: 1px dashed #000; padding: 1mm 0; }
  .cliente { word-break: break-word; }
  .totales { border-top: 1px dashed #000; margin-top: 1mm; padding-top: 1.5mm; }
  .total-cobrado { font-weight: bold; font-size: 14px; }
  .pie { border-top: 1px dashed #000; margin-top: 1.5mm; padding-top: 1.5mm; }
  .firma { margin-top: 6mm; }
  .espacio-final { height: 15mm; }
  .btn-imprimir {
    display: block; width: 48mm; margin: 4mm auto 0; padding: 8px;
    background: #000; color: #fff; border: none; font-family: inherit; font-size: 12px;
  }
  @media print { .btn-imprimir { display: none; } }
`

// window.open debe ser síncrono dentro del gesto del usuario (el clic del
// botón) o el navegador bloquea el popup — por eso no hay ningún await antes.
export function imprimirTicketCorteCobrador(datos) {
  const ventana = window.open('', '_blank', 'width=320,height=600')
  if (!ventana) { alert('El navegador bloqueó la ventana emergente. Habilítala para imprimir el ticket.'); return }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Corte ${datos.nombreCobrador || ''}</title>
<style>${ESTILOS}</style>
</head>
<body>
${renderToStaticMarkup(<TicketCorteCobrador {...datos} />)}
<button class="btn-imprimir" onclick="window.print()">Imprimir</button>
<script>window.onload = function () { window.print(); }</script>
</body>
</html>`

  ventana.document.write(html)
  ventana.document.close()
}
