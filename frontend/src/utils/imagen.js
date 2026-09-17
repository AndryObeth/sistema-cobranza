// Comprime una imagen (foto de comprobante de depósito, etc.) a un data URI
// JPEG antes de subirla — evita mandar fotos de varios MB tal cual salen de
// la cámara. Usado por Cobranza.jsx y Verificacion.jsx.
export function comprimirImagen(file, maxLado = 1000, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
      const w = Math.round(img.width * escala)
      const h = Math.round(img.height * escala)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', calidad))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}
