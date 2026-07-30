/**
 * Identidad de afirmación: extracción de los identificadores estables que
 * declaran y citan los documentos del corpus.
 *
 * Autorizado por ADR-0003. La notación no es nueva: ADR-0001 ya numeraba sus
 * invariantes y PROYECCION-v1 ya los citaba. Este módulo la generaliza y la
 * hace comprobable.
 *
 * Dos formas de declarar, ambas ya presentes en el corpus:
 *
 *   | INV-C02 | `carryIn(W+1) = carryOut(W)` |     fila cuya primera celda es el ID
 *   Un hecho vive en un documento. <!-- af: AF-DUENO-UNICO -->
 *
 * Una referencia es el mismo identificador escrito en cualquier otro sitio.
 */

import type { DocumentoCorpus } from './corpus.ts'

/**
 * Familias de identificador. `INV` numera invariantes de dominio y su cuerpo
 * termina siempre en dos dígitos; `AF` nombra afirmaciones normativas y su
 * cuerpo es semántico, porque un identificador que se lee en una cita debería
 * significar algo por sí mismo.
 */
const ID_INVARIANTE = 'INV-[A-Z$]{1,3}\\d{2}'
const ID_AFIRMACION = 'AF-[A-Z0-9]+(?:-[A-Z0-9]+)*'

export const PATRON_ID = new RegExp(`^(?:${ID_INVARIANTE}|${ID_AFIRMACION})$`)
const PATRON_REFERENCIA = new RegExp(`(?:${ID_INVARIANTE}|${ID_AFIRMACION})`, 'g')

const MARCA_EN_LINEA = /<!--\s*af:\s*([^\s]+)\s*-->/
const LONGITUD_EXTRACTO = 140

export interface Declaracion {
  readonly id: string
  readonly documento: DocumentoCorpus
  readonly linea: number
  readonly extracto: string
}

export interface Referencia {
  readonly id: string
  readonly documento: DocumentoCorpus
  readonly linea: number
}

/**
 * Líneas del documento con las de dentro de un bloque de código vaciadas.
 *
 * Se vacían en lugar de eliminarse para que los números de línea de los
 * hallazgos sigan siendo los del fichero. Un ejemplo dentro de un bloque
 * ilustra la notación; no declara ni cita nada.
 */
function lineasFueraDeCodigo(contenido: string): string[] {
  let dentro = false
  return contenido.split('\n').map((linea) => {
    if (linea.trimStart().startsWith('```')) {
      dentro = !dentro
      return ''
    }
    return dentro ? '' : linea
  })
}

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > LONGITUD_EXTRACTO
    ? `${limpio.slice(0, LONGITUD_EXTRACTO - 1)}…`
    : limpio
}

/** Celdas de una fila de tabla markdown, sin los delimitadores exteriores. */
function celdas(linea: string): string[] | null {
  const recortada = linea.trim()
  if (!recortada.startsWith('|') || !recortada.endsWith('|')) return null
  return recortada
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim())
}

export function extraerDeclaraciones(documento: DocumentoCorpus): Declaracion[] {
  const declaraciones: Declaracion[] = []

  lineasFueraDeCodigo(documento.contenido).forEach((linea, indice) => {
    const marca = MARCA_EN_LINEA.exec(linea)
    if (marca !== null) {
      declaraciones.push({
        id: marca[1],
        documento,
        linea: indice + 1,
        extracto: recortar(linea.replace(MARCA_EN_LINEA, '')),
      })
      return
    }

    const columnas = celdas(linea)
    if (columnas === null || columnas.length < 2) return
    if (!PATRON_ID.test(columnas[0])) return

    declaraciones.push({
      id: columnas[0],
      documento,
      linea: indice + 1,
      extracto: recortar(columnas.slice(1).join(' · ')),
    })
  })

  return declaraciones
}

/**
 * Referencias a identificadores. Se excluye la línea que los declara: un
 * documento no se cita a sí mismo por declarar.
 *
 * Los rangos y las familias que el corpus escribe en prosa —«INV-C03–C09»,
 * «INV-C / INV-L»— no producen falsas referencias: el patrón exige el
 * identificador completo, así que de «INV-C03–C09» solo reconoce «INV-C03», y
 * «INV-C» no lo reconoce en absoluto.
 */
export function extraerReferencias(documento: DocumentoCorpus): Referencia[] {
  const declaradosAqui = new Set(extraerDeclaraciones(documento).map((d) => `${d.id}:${d.linea}`))
  const referencias: Referencia[] = []

  lineasFueraDeCodigo(documento.contenido).forEach((linea, indice) => {
    for (const coincidencia of linea.matchAll(PATRON_REFERENCIA)) {
      const id = coincidencia[0]
      if (declaradosAqui.has(`${id}:${indice + 1}`)) continue
      referencias.push({ id, documento, linea: indice + 1 })
    }
  })

  return referencias
}
