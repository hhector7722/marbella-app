/**
 * Generador de los artefactos derivados de Marbella OS.
 *
 * CANON §10: los derivados se generan desde el corpus, viven en
 * marbella-os/.generated/ y nunca se editan a mano. El validador compara lo
 * que hay en disco con lo que este generador produce, así que una edición
 * manual se detecta en el momento.
 *
 *   npm run generate:corpus
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  CORPUS_ROOT,
  GENERATED_DIR,
  calcularHuella,
  esNormativo,
  leerCorpus,
  type DocumentoCorpus,
} from './marbella-os/corpus.ts'

export interface Derivado {
  readonly nombre: string
  readonly contenido: string
}

const FUENTE_CARGA_CONTEXTO = 'README.md'

/** Extrae la tabla que sigue a un encabezado concreto. */
function extraerTabla(markdown: string, encabezado: string): string[] {
  const lineas = markdown.split('\n')
  const inicio = lineas.findIndex((l) => l.trim() === encabezado)
  if (inicio === -1) throw new Error(`no se encuentra el encabezado «${encabezado}»`)

  const filas: string[] = []
  let dentro = false
  for (const linea of lineas.slice(inicio + 1)) {
    if (linea.startsWith('#')) break
    if (linea.startsWith('|')) {
      dentro = true
      filas.push(linea)
    } else if (dentro && linea.trim() === '') {
      break
    }
  }
  if (filas.length < 3) throw new Error(`la tabla de «${encabezado}» está vacía`)
  return filas
}

/** `[TOKENS](2-diseno/TOKENS.md)` → `` `marbella-os/2-diseno/TOKENS.md` `` */
function enlacesARutas(fila: string): string {
  return fila.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, _texto: string, destino: string) => {
    return `\`marbella-os/${destino}\``
  })
}

function cabecera(fuentes: readonly string[]): string {
  return [
    `<!-- Generado desde ${fuentes.length} documentos de marbella-os/.`,
    `     Huella del origen: ${calcularHuella(fuentes)}`,
    '     NO EDITAR A MANO: se regenera con `npm run generate:corpus`, y',
    '     `npm run validate:corpus` compara este fichero con lo que produce',
    '     el generador. Cualquier edición manual se detecta. -->',
  ].join('\n')
}

function tablaDeAutoridad(documentos: readonly DocumentoCorpus[]): string {
  const normativos = documentos
    .filter((d) => esNormativo(d) && d.nombreFichero !== 'README.md')
    .map((d) => ({
      ruta: d.rutaCorpus,
      precedencia: Number(d.campos.get('precedencia') ?? 0),
    }))
    .sort((a, b) => b.precedencia - a.precedencia || a.ruta.localeCompare(b.ruta))

  const filas = normativos.map((d) => `| ${d.precedencia} | \`marbella-os/${d.ruta}\` |`)
  return ['| Precedencia | Documento |', '|---|---|', ...filas].join('\n')
}

function construirCargaDeContexto(documentos: readonly DocumentoCorpus[]): Derivado {
  const readme = readFileSync(join(CORPUS_ROOT, FUENTE_CARGA_CONTEXTO), 'utf8')
  const tabla = extraerTabla(readme, '## Qué leer según lo que vas a tocar')
    .map(enlacesARutas)
    .join('\n')

  const fuentes = [FUENTE_CARGA_CONTEXTO, ...documentos.filter(esNormativo).map((d) => d.rutaCorpus)]

  const contenido = `${cabecera(fuentes)}

# Carga de contexto

Derivado de \`marbella-os/README.md\`. **No es fuente de nada**: si contradice al
corpus, gana el corpus.

${tabla}

# Autoridad ante conflicto

Cuando dos documentos vigentes se contradigan, gana el de precedencia mayor. Si
empatan, no elijas: hay una duplicación que resolver, y la regla que la prohíbe
es \`CANON §5\`.

${tablaDeAutoridad(documentos)}

Todo lo que no aparece en esta tabla **no es normativo** y no autoriza ninguna
decisión, empezando por los ${documentos.filter((d) => !esNormativo(d)).length} documentos de \`marbella-os/6-investigacion/\`.
`

  return { nombre: 'CARGA-DE-CONTEXTO.md', contenido }
}

export function construirDerivados(): Derivado[] {
  const documentos = leerCorpus().filter((d) => d.tieneFrontMatter && d.errorFrontMatter === null)
  return [construirCargaDeContexto(documentos)]
}

// Solo escribe cuando se ejecuta como script; el validador solo importa.
if (process.argv[1]?.endsWith('generate-marbella-os-derived.ts') === true) {
  mkdirSync(GENERATED_DIR, { recursive: true })
  for (const derivado of construirDerivados()) {
    writeFileSync(join(GENERATED_DIR, derivado.nombre), derivado.contenido, 'utf8')
    console.log(`generado: marbella-os/.generated/${derivado.nombre}`)
  }
}
