/**
 * Lectura del corpus de Marbella OS.
 *
 * Lo usan el validador (scripts/validate-marbella-os.ts) y el generador de
 * derivados (scripts/generate-marbella-os-derived.ts). Vive fuera de
 * marbella-os/ porque CANON §11 prohíbe código dentro del corpus.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export const CORPUS_ROOT = resolve(process.cwd(), 'marbella-os')
export const GENERATED_DIR = join(CORPUS_ROOT, '.generated')

/** Vocabularios cerrados de CANON §4. */
export const CLASES = ['constitucional', 'vivo', 'inmutable'] as const
export const ESTADOS = ['borrador', 'propuesto', 'vigente', 'superado', 'archivado'] as const
export const CAPAS = [
  'raiz',
  'producto',
  'diseno',
  'ingenieria',
  'decisiones',
  'estado',
  'investigacion',
] as const

export type Clase = (typeof CLASES)[number]
export type Estado = (typeof ESTADOS)[number]
export type Capa = (typeof CAPAS)[number]

/** Escala de CANON §4, proyección del orden de prevalencia de CANON §6. */
export const PRECEDENCIA = {
  canon: 100,
  adr: 80,
  constitucional: 60,
  contrato: 40,
  vivo: 20,
  noNormativo: 0,
} as const

/** Directorio de capa → valor esperado del campo `capa`. */
const CAPA_POR_DIRECTORIO: Record<string, Capa> = {
  '1-producto': 'producto',
  '2-diseno': 'diseno',
  '3-ingenieria': 'ingenieria',
  '4-decisiones': 'decisiones',
  '5-estado': 'estado',
  '6-investigacion': 'investigacion',
}

export interface DocumentoCorpus {
  /** Ruta relativa a la raíz del repositorio, con separador `/`. */
  readonly ruta: string
  /** Ruta relativa a marbella-os/, con separador `/`. */
  readonly rutaCorpus: string
  readonly rutaAbsoluta: string
  readonly nombreFichero: string
  /** Capa deducida del directorio, o `raiz` si el documento cuelga de marbella-os/. */
  readonly capaEsperada: Capa
  readonly contenido: string
  /** Campos del front-matter. Vacío si no lo tiene. */
  readonly campos: ReadonlyMap<string, string>
  readonly tieneFrontMatter: boolean
  /** Error de forma del front-matter, si lo hay. */
  readonly errorFrontMatter: string | null
  /** Línea en la que empieza el cuerpo, 1-indexada. Para situar hallazgos. */
  readonly lineaCuerpo: number
}

function listarMarkdown(directorio: string, acumulador: string[]): string[] {
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name)
    if (entrada.isDirectory()) {
      // Los derivados no forman parte del corpus: se generan desde él.
      if (entrada.name === '.generated') continue
      listarMarkdown(ruta, acumulador)
    } else if (entrada.name.endsWith('.md')) {
      acumulador.push(ruta)
    }
  }
  return acumulador
}

function parsearFrontMatter(contenido: string): {
  campos: Map<string, string>
  tieneFrontMatter: boolean
  error: string | null
  lineaCuerpo: number
} {
  const campos = new Map<string, string>()
  const lineas = contenido.split('\n')

  if (lineas[0] !== '---') {
    return { campos, tieneFrontMatter: false, error: null, lineaCuerpo: 1 }
  }

  let cierre = -1
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i] === '---') {
      cierre = i
      break
    }
  }

  if (cierre === -1) {
    return {
      campos,
      tieneFrontMatter: true,
      error: 'el front-matter se abre con `---` y no se cierra',
      lineaCuerpo: 1,
    }
  }

  for (let i = 1; i < cierre; i++) {
    const linea = lineas[i]
    if (linea.trim() === '') continue
    const separador = linea.indexOf(':')
    if (separador === -1) {
      return {
        campos,
        tieneFrontMatter: true,
        error: `línea ${i + 1} del front-matter sin \`clave: valor\`: «${linea.trim()}»`,
        lineaCuerpo: cierre + 2,
      }
    }
    const clave = linea.slice(0, separador).trim()
    const valor = linea.slice(separador + 1).trim()
    if (campos.has(clave)) {
      return {
        campos,
        tieneFrontMatter: true,
        error: `campo duplicado en el front-matter: \`${clave}\``,
        lineaCuerpo: cierre + 2,
      }
    }
    campos.set(clave, valor)
  }

  return { campos, tieneFrontMatter: true, error: null, lineaCuerpo: cierre + 2 }
}

export function leerCorpus(): DocumentoCorpus[] {
  const ficheros = listarMarkdown(CORPUS_ROOT, []).sort()

  return ficheros.map((rutaAbsoluta) => {
    const rutaCorpus = relative(CORPUS_ROOT, rutaAbsoluta).split('\\').join('/')
    const contenido = readFileSync(rutaAbsoluta, 'utf8')
    const { campos, tieneFrontMatter, error, lineaCuerpo } = parsearFrontMatter(contenido)
    const primerSegmento = rutaCorpus.includes('/') ? rutaCorpus.split('/')[0] : ''

    return {
      ruta: relative(process.cwd(), rutaAbsoluta).split('\\').join('/'),
      rutaCorpus,
      rutaAbsoluta,
      nombreFichero: rutaCorpus.split('/').at(-1) ?? rutaCorpus,
      capaEsperada: CAPA_POR_DIRECTORIO[primerSegmento] ?? 'raiz',
      contenido,
      campos,
      tieneFrontMatter,
      errorFrontMatter: error,
      lineaCuerpo,
    }
  })
}

export function esNormativo(documento: DocumentoCorpus): boolean {
  return documento.campos.get('normativo') === 'true'
}

/**
 * Precedencia que le corresponde según CANON §6, para contrastarla con la
 * declarada. Devuelve `null` cuando no hay regla aplicable y el campo no puede
 * comprobarse automáticamente.
 */
export function precedenciaEsperada(documento: DocumentoCorpus): number | null {
  const clase = documento.campos.get('clase')
  const estado = documento.campos.get('estado')
  const nombre = documento.campos.get('documento')

  if (documento.campos.get('normativo') === 'false') return PRECEDENCIA.noNormativo
  if (estado === 'archivado' || estado === 'superado') return PRECEDENCIA.noNormativo
  if (nombre === 'CANON') return PRECEDENCIA.canon
  if (documento.nombreFichero.startsWith('ADR-')) return PRECEDENCIA.adr
  if (clase === 'constitucional') return PRECEDENCIA.constitucional
  if (documento.rutaCorpus.startsWith('3-ingenieria/contratos/') && clase === 'inmutable') {
    return PRECEDENCIA.contrato
  }
  if (clase === 'vivo' || clase === 'inmutable') return PRECEDENCIA.vivo
  return null
}

/**
 * Huella del estado de los documentos de los que se deriva un artefacto.
 * CANON §10 exige que los derivados no se editen a mano; la huella es lo que
 * permite detectar que se ha hecho, o que la fuente cambió sin regenerar.
 */
export function calcularHuella(rutasCorpus: readonly string[]): string {
  const hash = createHash('sha256')
  for (const rutaCorpus of [...rutasCorpus].sort()) {
    const rutaAbsoluta = join(CORPUS_ROOT, rutaCorpus)
    hash.update(rutaCorpus)
    hash.update('\0')
    hash.update(readFileSync(rutaAbsoluta))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

export function existe(rutaAbsoluta: string): boolean {
  try {
    statSync(rutaAbsoluta)
    return true
  } catch {
    return false
  }
}
