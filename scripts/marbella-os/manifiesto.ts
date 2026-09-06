/**
 * Lectura del manifiesto de indexación (INDEXACION.md, raíz del repositorio).
 *
 * Declara qué directorios del repositorio son conocimiento y cuáles son ruido.
 * Lo consumen el validador —que exige que todo directorio con markdown esté
 * clasificado— y cualquier indexador externo.
 *
 * El manifiesto lleva su contrato en un bloque ```yaml para que se lea igual de
 * bien a ojo que a máquina. El parseo es deliberadamente mínimo: claves de
 * primer nivel y listas de cadenas. No se añade una dependencia de YAML para
 * cuatro listas.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { existe } from './corpus.ts'

export const RAIZ_REPO = process.cwd()
export const RUTA_MANIFIESTO = resolve(RAIZ_REPO, 'INDEXACION.md')

/** Categorías del manifiesto. El validador exige que estén todas. */
export const CATEGORIAS = ['corpus', 'derivados', 'satelites', 'excluir'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export interface Manifiesto {
  readonly categorias: ReadonlyMap<Categoria, readonly string[]>
  /** Toda ruta declarada, en cualquier categoría, sin barra final. */
  readonly declaradas: ReadonlySet<string>
  readonly error: string | null
}

const BLOQUE_YAML = /```yaml\n([\s\S]*?)```/

function sinBarraFinal(ruta: string): string {
  return ruta.endsWith('/') ? ruta.slice(0, -1) : ruta
}

export function leerManifiesto(): Manifiesto {
  const vacio = {
    categorias: new Map<Categoria, readonly string[]>(),
    declaradas: new Set<string>(),
  }

  if (!existe(RUTA_MANIFIESTO)) {
    return { ...vacio, error: 'no existe INDEXACION.md en la raíz del repositorio' }
  }

  const bloque = BLOQUE_YAML.exec(readFileSync(RUTA_MANIFIESTO, 'utf8'))
  if (bloque === null) {
    return { ...vacio, error: 'INDEXACION.md no contiene el bloque ```yaml con la clasificación' }
  }

  const categorias = new Map<Categoria, string[]>()
  const declaradas = new Set<string>()
  let actual: Categoria | null = null

  for (const [indice, linea] of bloque[1].split('\n').entries()) {
    const sinComentario = linea.replace(/(^|\s)#.*$/, '').trimEnd()
    if (sinComentario.trim() === '') continue

    const item = /^\s+-\s+(\S+)$/.exec(sinComentario)
    if (item !== null) {
      if (actual === null) {
        return { ...vacio, error: `línea ${indice + 1} del bloque: item sin categoría que lo preceda` }
      }
      const ruta = sinBarraFinal(item[1])
      categorias.get(actual)?.push(ruta)
      declaradas.add(ruta)
      continue
    }

    const clave = /^([a-z_]+):$/.exec(sinComentario.trim())
    if (clave === null) {
      return { ...vacio, error: `línea ${indice + 1} del bloque no es \`categoria:\` ni \`- ruta\`: «${sinComentario.trim()}»` }
    }
    if (!(CATEGORIAS as readonly string[]).includes(clave[1])) {
      return {
        ...vacio,
        error: `categoría desconocida \`${clave[1]}\`: solo existen ${CATEGORIAS.join(', ')}`,
      }
    }
    actual = clave[1] as Categoria
    categorias.set(actual, [])
  }

  for (const categoria of CATEGORIAS) {
    if (!categorias.has(categoria)) {
      return { ...vacio, error: `falta la categoría \`${categoria}\` en el bloque` }
    }
  }

  return { categorias, declaradas, error: null }
}

/** Directorios de primer nivel de una raíz, sin `.git`. Por defecto el repo. */
export function directoriosDePrimerNivel(raiz: string = RAIZ_REPO): string[] {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '.git' && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
}

/**
 * Si el árbol contiene algún `.md`. Para en el primero: recorrer node_modules
 * entero para responder «sí» sería absurdo.
 */
export function contieneMarkdown(directorio: string): boolean {
  let entradas: ReturnType<typeof readdirSync>
  try {
    entradas = readdirSync(directorio, { withFileTypes: true })
  } catch {
    return false
  }

  const subdirectorios: string[] = []
  for (const entrada of entradas) {
    if (entrada.isDirectory()) {
      subdirectorios.push(join(directorio, entrada.name))
    } else if (entrada.name.endsWith('.md')) {
      return true
    }
  }
  return subdirectorios.some(contieneMarkdown)
}

/**
 * Categorías cuyo contenido es inventario real del repositorio. `excluir` queda
 * fuera: es un catálogo preventivo de espejos de herramientas (INDEXACION.md
 * «Por qué no se borran los espejos»), y exigirle existencia contradiría su
 * función.
 */
export const CATEGORIAS_CON_INVENTARIO = ['corpus', 'derivados', 'satelites'] as const

export interface HallazgoManifiesto {
  readonly comprobacion: string
  readonly documento: string
  readonly detalle: string
}

/**
 * Cobertura del manifiesto, en las dos direcciones que valida CANON §11:
 *
 * 1. Un directorio real con markdown que nadie ha clasificado acaba en el
 *    índice de cualquier agente; el manifiesto obliga a decidirlo por escrito.
 * 2. Lo declarado como inventario real (corpus, derivados, satélites) debe
 *    existir: no se declara lo que no hay. Las exclusiones preventivas se
 *    declaran aunque el espejo aún no esté instalado.
 */
export function comprobarManifiesto(
  manifiesto: Manifiesto,
  raiz: string = RAIZ_REPO,
): HallazgoManifiesto[] {
  const hallazgos: HallazgoManifiesto[] = []

  for (const directorio of directoriosDePrimerNivel(raiz)) {
    if (manifiesto.declaradas.has(directorio)) continue
    if (contieneMarkdown(join(raiz, directorio))) {
      hallazgos.push({
        comprobacion: '12 · manifiesto',
        documento: `${directorio}/`,
        detalle:
          'contiene markdown y no está clasificado en INDEXACION.md: decide si es corpus, satélite, derivado o ruido',
      })
    }
  }

  for (const categoria of CATEGORIAS_CON_INVENTARIO) {
    for (const ruta of manifiesto.categorias.get(categoria) ?? []) {
      if (!existe(resolve(raiz, ruta))) {
        hallazgos.push({
          comprobacion: '12 · manifiesto',
          documento: 'INDEXACION.md',
          detalle: `clasifica \`${ruta}/\` en \`${categoria}\` y no existe`,
        })
      }
    }
  }

  return hallazgos
}
