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
  calcularVigencia,
  esNormativo,
  leerCorpus,
  type DocumentoCorpus,
  type Vigencia,
} from './marbella-os/corpus.ts'
import { extraerDeclaraciones, extraerReferencias } from './marbella-os/afirmaciones.ts'
import { construirAristas, dependenciasDeclaradas } from './marbella-os/grafo.ts'

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

/**
 * Agenda de revisión del corpus.
 *
 * Publica la fecha en la que cada documento pide revisión, no si ya la pide:
 * un derivado que dependiera del día de ejecución cambiaría solo, y el
 * validador lo leería como una edición manual. Quien pone el reloj es
 * `validate:corpus`; este fichero solo dice a qué hora suena cada uno.
 */
function construirObsolescencia(documentos: readonly DocumentoCorpus[]): Derivado {
  const conVigencia = documentos
    .map((doc) => ({ doc, vigencia: calcularVigencia(doc) }))
    .filter(
      (fila): fila is { doc: DocumentoCorpus; vigencia: Vigencia } =>
        fila.vigencia !== null && typeof fila.vigencia !== 'string',
    )
    .sort(
      (a, b) =>
        a.vigencia.limite.localeCompare(b.vigencia.limite) ||
        a.doc.rutaCorpus.localeCompare(b.doc.rutaCorpus),
    )

  const filas = conVigencia.map(
    ({ doc, vigencia }) =>
      `| ${vigencia.limite} | \`marbella-os/${doc.rutaCorpus}\` | ${vigencia.revisado} | ${vigencia.caducidad} | ${doc.campos.get('responsable') ?? '—'} |`,
  )

  const permanentes = documentos.filter((d) => d.campos.get('caducidad') === 'no aplica').length

  const contenido = `${cabecera(conVigencia.map(({ doc }) => doc.rutaCorpus))}

# Agenda de revisión

Cuándo pide revisión cada documento vivo, de lo más urgente a lo más lejano.
Derivado del front-matter. **No es norma**: es cola de trabajo.

La fecha límite sale de \`revisado\` más \`caducidad\`. Este fichero no dice qué
está vencido hoy, a propósito: lo comprueba \`npm run validate:corpus\` contra la
fecha real. En una rama avisa; en \`main\` falla.

Renovar un documento no es cambiarle la fecha. Es leerlo, confirmar que sigue
siendo verdad y dejar constancia de la revisión en el cambio que la hace.

| Vence | Documento | Revisado | Caducidad | Responsable |
|---|---|---|---|---|
${filas.join('\n')}

Los ${permanentes} documentos con \`caducidad: no aplica\` no aparecen aquí: son
inmutables o congelados, y revisarlos no tendría sentido.
`

  return { nombre: 'OBSOLESCENCIA.md', contenido }
}

/**
 * Registro de afirmaciones citables.
 *
 * Existe para que citar sea más barato que copiar: quien necesita un hecho que
 * ya está escrito encuentra aquí su identificador en lugar de reescribirlo.
 */
function construirAfirmaciones(documentos: readonly DocumentoCorpus[]): Derivado {
  const normativos = documentos.filter(esNormativo)

  const declaraciones = normativos
    .flatMap(extraerDeclaraciones)
    .sort((a, b) => a.id.localeCompare(b.id))

  const veces = new Map<string, number>()
  for (const referencia of normativos.flatMap(extraerReferencias)) {
    veces.set(referencia.id, (veces.get(referencia.id) ?? 0) + 1)
  }

  const filas = declaraciones.map((d) => {
    const citas = veces.get(d.id) ?? 0
    return `| \`${d.id}\` | ${d.extracto.split('|').join('\\|')} | \`marbella-os/${d.documento.rutaCorpus}\` | ${d.documento.campos.get('precedencia') ?? '—'} | ${citas === 0 ? '' : citas} |`
  })

  const contenido = `${cabecera(declaraciones.map((d) => d.documento.rutaCorpus))}

# Afirmaciones citables

Los ${declaraciones.length} hechos del corpus que tienen identificador estable, con dónde
viven y desde cuántos sitios se citan. Derivado. **No es norma**: la norma está
en el documento de origen, y este índice solo dice dónde.

Para reutilizar un hecho que ya está escrito, cita su identificador. Copiar el
texto crea un segundo dueño, y eso es exactamente lo que prohíbe \`CANON §5\`.

| Identificador | Afirmación | Documento | Precedencia | Citas |
|---|---|---|---|---|
${filas.join('\n')}

La columna de citas mide cuánto se apoya el corpus en cada hecho. Un
identificador muy citado es un punto que no debería cambiar sin revisar quién
lo usa; uno sin citas todavía no le hace falta a nadie.
`

  return { nombre: 'AFIRMACIONES.md', contenido }
}

/**
 * Grafo de impacto.
 *
 * Se publica invertido —quién depende de cada documento— porque esa es la
 * pregunta que se hace en la práctica: voy a cambiar esto, ¿qué se me rompe?
 * La dirección declarada en el front-matter es la contraria, y es la correcta
 * para escribirla: cada documento sabe en qué se apoya, no quién se apoya en él.
 */
function construirGrafo(documentos: readonly DocumentoCorpus[]): Derivado {
  const aristas = construirAristas(documentos)

  const dependientes = new Map<string, string[]>()
  for (const arista of aristas) {
    const lista = dependientes.get(arista.hacia) ?? []
    lista.push(arista.desde)
    dependientes.set(arista.hacia, lista)
  }

  const rutaPorNombre = new Map(
    documentos.flatMap((d) => {
      const nombre = d.campos.get('documento')
      return nombre === undefined ? [] : [[nombre, d.rutaCorpus] as const]
    }),
  )

  const filas = [...dependientes.keys()].sort().map((destino) => {
    const quienes = [...new Set(dependientes.get(destino))]
      .sort()
      .map((n) => `\`${n}\``)
      .join(', ')
    const ruta = rutaPorNombre.get(destino)
    return `| \`${destino}\` | ${ruta === undefined ? '—' : `\`marbella-os/${ruta}\``} | ${quienes} |`
  })

  const cuerpo =
    filas.length === 0
      ? 'Ningún documento declara todavía `depende_de`.'
      : `| Si cambia | Documento | Hay que revisar |
|---|---|---|
${filas.join('\n')}`

  const contenido = `${cabecera(
    aristas.map((a) => a.origen.rutaCorpus),
  )}

# Grafo de impacto

Qué documentos hay que revisar cuando otro cambia. Derivado del campo
\`depende_de\`. **No es norma**: es una ayuda para no dejarse nada.

Las aristas se declaran al revés de como se leen aquí. Cada documento declara
en qué se apoya, porque eso lo sabe quien lo escribe; esta tabla lo invierte
para responder a la pregunta que surge al cambiar algo.

${cuerpo}

Que un documento no aparezca aquí no significa que nadie dependa de él:
significa que nadie lo ha declarado. La adopción es incremental, y la decisión
que la gobierna es \`ADR-0004\`.
`

  return { nombre: 'GRAFO.md', contenido }
}

/**
 * Índice para máquinas.
 *
 * Un indexador externo no debería tener que entender el markdown ni el
 * front-matter de este corpus para saber qué puede citar. Aquí tiene lo mínimo
 * para decidirlo: qué es normativo, qué está vigente, qué precedencia tiene y
 * cuándo caduca.
 */
function construirPrecedencia(documentos: readonly DocumentoCorpus[]): Derivado {
  const entradas = documentos
    .map((doc) => {
      const vigencia = calcularVigencia(doc)
      return {
        ruta: `marbella-os/${doc.rutaCorpus}`,
        documento: doc.campos.get('documento') ?? null,
        clase: doc.campos.get('clase') ?? null,
        estado: doc.campos.get('estado') ?? null,
        capa: doc.campos.get('capa') ?? null,
        normativo: esNormativo(doc),
        citable: esNormativo(doc) && doc.campos.get('estado') === 'vigente',
        precedencia: Number(doc.campos.get('precedencia') ?? 0),
        vence: vigencia !== null && typeof vigencia !== 'string' ? vigencia.limite : null,
        depende_de: dependenciasDeclaradas(doc),
      }
    })
    .sort((a, b) => b.precedencia - a.precedencia || a.ruta.localeCompare(b.ruta))

  const contenido = `${JSON.stringify(
    {
      _generado:
        'Derivado de marbella-os/. No editar a mano: se regenera con `npm run generate:corpus`.',
      _huella: calcularHuella(documentos.map((d) => d.rutaCorpus)),
      _citable: 'normativo === true && estado === "vigente"',
      documentos: entradas,
    },
    null,
    2,
  )}\n`

  return { nombre: 'PRECEDENCIA.json', contenido }
}

export function construirDerivados(): Derivado[] {
  const documentos = leerCorpus().filter((d) => d.tieneFrontMatter && d.errorFrontMatter === null)
  return [
    construirCargaDeContexto(documentos),
    construirObsolescencia(documentos),
    construirAfirmaciones(documentos),
    construirGrafo(documentos),
    construirPrecedencia(documentos),
  ]
}

// Solo escribe cuando se ejecuta como script; el validador solo importa.
if (process.argv[1]?.endsWith('generate-marbella-os-derived.ts') === true) {
  mkdirSync(GENERATED_DIR, { recursive: true })
  for (const derivado of construirDerivados()) {
    writeFileSync(join(GENERATED_DIR, derivado.nombre), derivado.contenido, 'utf8')
    console.log(`generado: marbella-os/.generated/${derivado.nombre}`)
  }
}
