// Normaliza texto para busquedas: minusculas, sin acentos/diacriticos y sin
// espacios sobrantes. "Maria Nunez" <- "María Núñez".
// Asi una busqueda escrita sin acentos igual encuentra los nombres acentuados
// (y viceversa).
export function sinAcentos(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Contiene `termino`, ignorando acentos y mayusculas.
export function incluyeTexto(texto, termino) {
  return sinAcentos(texto).includes(sinAcentos(termino))
}

// Empieza con `termino`, ignorando acentos y mayusculas.
// Util para numeros de cuenta ("1-C" no debe casar con "11-C").
export function empiezaCon(texto, termino) {
  return sinAcentos(texto).startsWith(sinAcentos(termino))
}
