/**
 * Validador del corpus de Marbella OS.
 *
 * Convierte en invariantes comprobados las reglas de CANON que una máquina
 * puede verificar. Autorizado por ADR-0002, que también documenta lo que este
 * validador deliberadamente no comprueba.
 *
 *   npm run validate:corpus
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

import {
  CAPAS,
  CLASES,
  CORPUS_ROOT,
  ESTADOS,
  GENERATED_DIR,
  PRECEDENCIA,
  calcularVigencia,
  esNormativo,
  existe,
  hoyLocal,
  leerCorpus,
  precedenciaEsperada,
  type DocumentoCorpus,
} from './marbella-os/corpus.ts'
import {
  PATRON_ID,
  extraerDeclaraciones,
  extraerReferencias,
  type Declaracion,
} from './marbella-os/afirmaciones.ts'
import { buscarCiclo, construirAristas } from './marbella-os/grafo.ts'
import {
  RAIZ_REPO,
  comprobarManifiesto,
  leerManifiesto,
} from './marbella-os/manifiesto.ts'
import { construirDerivados } from './generate-marbella-os-derived.ts'

interface Hallazgo {
  readonly comprobacion: string
  readonly documento: string
  readonly detalle: string
}

const errores: Hallazgo[] = []
const avisos: Hallazgo[] = []

function error(comprobacion: string, documento: string, detalle: string): void {
  errores.push({ comprobacion, documento, detalle })
}

function aviso(comprobacion: string, documento: string, detalle: string): void {
  avisos.push({ comprobacion, documento, detalle })
}

const documentos = leerCorpus()

// ---------------------------------------------------------------------------
// 1. Front-matter presente y bien formado — CANON §4
// ---------------------------------------------------------------------------

const CAMPOS_OBLIGATORIOS = [
  'documento',
  'clase',
  'estado',
  'capa',
  'normativo',
  'precedencia',
  'responsable',
] as const

for (const doc of documentos) {
  if (!doc.tieneFrontMatter) {
    error('1 · front-matter', doc.ruta, 'no tiene front-matter')
    continue
  }
  if (doc.errorFrontMatter !== null) {
    error('1 · front-matter', doc.ruta, doc.errorFrontMatter)
    continue
  }
  for (const campo of CAMPOS_OBLIGATORIOS) {
    if (!doc.campos.has(campo)) {
      error('1 · front-matter', doc.ruta, `falta el campo obligatorio \`${campo}\``)
    }
  }
  // Un documento vivo o constitucional caduca; uno inmutable no.
  const clase = doc.campos.get('clase')
  if ((clase === 'vivo' || clase === 'constitucional') && !doc.campos.has('revisado')) {
    error('1 · front-matter', doc.ruta, `clase \`${clase}\` exige \`revisado\``)
  }
  if ((clase === 'vivo' || clase === 'constitucional') && !doc.campos.has('caducidad')) {
    error('1 · front-matter', doc.ruta, `clase \`${clase}\` exige \`caducidad\``)
  }
}

const conFrontMatter = documentos.filter((d) => d.tieneFrontMatter && d.errorFrontMatter === null)

// ---------------------------------------------------------------------------
// 2. Vocabulario cerrado de clase, estado y capa — CANON §4
// ---------------------------------------------------------------------------

function comprobarVocabulario(
  doc: DocumentoCorpus,
  campo: string,
  permitidos: readonly string[],
): void {
  const valor = doc.campos.get(campo)
  if (valor === undefined) return
  if (!permitidos.includes(valor)) {
    error(
      '2 · vocabulario',
      doc.ruta,
      `\`${campo}: ${valor}\` no está en el vocabulario (${permitidos.join(' | ')})`,
    )
  }
}

for (const doc of conFrontMatter) {
  comprobarVocabulario(doc, 'clase', CLASES)
  comprobarVocabulario(doc, 'estado', ESTADOS)
  comprobarVocabulario(doc, 'capa', CAPAS)

  const capa = doc.campos.get('capa')
  if (capa !== undefined && capa !== doc.capaEsperada) {
    error(
      '2 · vocabulario',
      doc.ruta,
      `\`capa: ${capa}\` no concuerda con su directorio, que exige \`${doc.capaEsperada}\``,
    )
  }
}

// ---------------------------------------------------------------------------
// 3. `normativo` presente y falso en toda la capa 6 — CANON §4, §8 regla 2
// ---------------------------------------------------------------------------

const DIRECTORIOS_NO_NORMATIVOS = ['6-investigacion/spikes/', '6-investigacion/archivo/']

for (const doc of conFrontMatter) {
  const valor = doc.campos.get('normativo')
  if (valor !== undefined && valor !== 'true' && valor !== 'false') {
    error('3 · normativo', doc.ruta, `\`normativo: ${valor}\` debe ser \`true\` o \`false\``)
  }

  const enDirectorioNoNormativo = DIRECTORIOS_NO_NORMATIVOS.some((prefijo) =>
    doc.rutaCorpus.startsWith(prefijo),
  )
  // El índice de cada directorio sí es norma: describe qué hay dentro.
  if (enDirectorioNoNormativo && doc.nombreFichero !== 'README.md' && valor !== 'false') {
    error(
      '3 · normativo',
      doc.ruta,
      'un análisis archivado nunca es norma (CANON §8 regla 2): exige `normativo: false`',
    )
  }

  const estado = doc.campos.get('estado')
  if ((estado === 'archivado' || estado === 'superado') && valor === 'true') {
    error('3 · normativo', doc.ruta, `\`estado: ${estado}\` es incompatible con \`normativo: true\``)
  }
}

// ---------------------------------------------------------------------------
// 4. `precedencia` coherente con la jerarquía — CANON §6
// ---------------------------------------------------------------------------

const VALORES_PRECEDENCIA = new Set<number>(Object.values(PRECEDENCIA))

for (const doc of conFrontMatter) {
  const bruto = doc.campos.get('precedencia')
  if (bruto === undefined) continue

  const valor = Number(bruto)
  if (!Number.isInteger(valor) || !VALORES_PRECEDENCIA.has(valor)) {
    error(
      '4 · precedencia',
      doc.ruta,
      `\`precedencia: ${bruto}\` no es uno de los valores de la escala (${[...VALORES_PRECEDENCIA]
        .sort((a, b) => b - a)
        .join(', ')})`,
    )
    continue
  }

  const esperada = precedenciaEsperada(doc)
  if (esperada !== null && esperada !== valor) {
    error(
      '4 · precedencia',
      doc.ruta,
      `declara \`precedencia: ${valor}\` pero CANON §6 le asigna ${esperada}`,
    )
  }
}

// ---------------------------------------------------------------------------
// 5. Enlaces internos resolubles — solo en documentos normativos
//
// Los congelados tienen enlaces rotos por diseño: corregirlos exigiría editar
// material inmutable. Lo declaran archivo/README.md y spikes/README.md.
// ---------------------------------------------------------------------------

const BLOQUES_DE_CODIGO = /```[\s\S]*?```/g
const ENLACE_MARKDOWN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

function esEnlaceExterno(destino: string): boolean {
  return (
    destino.startsWith('http://') ||
    destino.startsWith('https://') ||
    destino.startsWith('mailto:') ||
    destino.startsWith('#')
  )
}

for (const doc of conFrontMatter) {
  if (!esNormativo(doc)) continue

  const sinCodigo = doc.contenido.replace(BLOQUES_DE_CODIGO, '')
  for (const coincidencia of sinCodigo.matchAll(ENLACE_MARKDOWN)) {
    const destino = coincidencia[1]
    if (esEnlaceExterno(destino)) continue

    const sinAncla = decodeURIComponent(destino.split('#')[0])
    if (sinAncla === '') continue

    const rutaAbsoluta = resolve(dirname(doc.rutaAbsoluta), sinAncla)
    if (!existe(rutaAbsoluta)) {
      error('5 · enlaces', doc.ruta, `enlace roto: \`${destino}\``)
    }
  }
}

// ---------------------------------------------------------------------------
// 6. `supersede` verificable — CANON §8 regla 4
//
// Sustituir suele implicar borrar lo sustituido, así que una ruta fuera del
// corpus se acepta como traza histórica. Lo que sí se comprueba es lo que
// apunta dentro: debe existir y estar en `superado`.
// ---------------------------------------------------------------------------

const porRutaCorpus = new Map(conFrontMatter.map((d) => [d.rutaCorpus, d]))

for (const doc of conFrontMatter) {
  const bruto = doc.campos.get('supersede')
  if (bruto === undefined || bruto === '—') continue

  for (const trozo of bruto.split(',')) {
    // Se descarta la glosa entre paréntesis y la referencia a sección.
    const referencia = trozo.replace(/\([^)]*\)/g, '').split('§')[0].trim()
    if (referencia === '' || referencia === '—') continue

    const rutaCorpus = referencia.startsWith('marbella-os/')
      ? referencia.slice('marbella-os/'.length)
      : referencia
    const objetivo = porRutaCorpus.get(rutaCorpus)
    if (objetivo === undefined) continue // Fuera del corpus: traza histórica.

    if (objetivo.campos.get('estado') !== 'superado') {
      error(
        '6 · supersede',
        doc.ruta,
        `sustituye a \`${rutaCorpus}\`, que sigue en \`estado: ${objetivo.campos.get('estado')}\``,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Caducidad — CANON §4.
//
// En una rama avisa: un cambio no debe bloquearse por un documento ajeno sin
// revisar. En main falla, porque lo que se integra no arrastra deuda de
// revisión. La diferencia la marca MARBELLA_OS_ESTRICTO, que activa CI.
// ---------------------------------------------------------------------------

const ESTRICTO = (process.env.MARBELLA_OS_ESTRICTO ?? '') !== ''
const hoy = hoyLocal()

for (const doc of conFrontMatter) {
  const vigencia = calcularVigencia(doc)
  if (vigencia === null) continue
  if (typeof vigencia === 'string') {
    error('7 · caducidad', doc.ruta, vigencia)
    continue
  }

  if (hoy > vigencia.limite) {
    const detalle = `revisado el ${vigencia.revisado} con caducidad de ${vigencia.caducidad}: venció el ${vigencia.limite}`
    if (ESTRICTO) {
      error('7 · caducidad', doc.ruta, detalle)
    } else {
      aviso('7 · caducidad', doc.ruta, detalle)
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Convención de nombres — CANON §7
// ---------------------------------------------------------------------------

const NOMBRE_GENERAL = /^[A-Z0-9]+(?:-[A-Z0-9]+)*\.md$/
const NOMBRE_ADR = /^ADR-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const NOMBRE_RFC = /^RFC-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const NOMBRE_FECHADO = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const NOMBRE_CONTRATO = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-v\d+\.md$/

for (const doc of documentos) {
  const nombre = doc.nombreFichero
  if (nombre === 'README.md') continue
  if (nombre.startsWith('_')) continue // Plantilla: CANON §7 la exime.

  const directorio = doc.rutaCorpus.split('/').slice(0, -1).join('/')
  let valido: boolean
  let forma: string

  if (directorio === '4-decisiones') {
    valido = NOMBRE_ADR.test(nombre)
    forma = 'ADR-NNNN-slug-en-minusculas.md'
  } else if (directorio === '6-investigacion/rfc') {
    valido = NOMBRE_RFC.test(nombre)
    forma = 'RFC-NNNN-slug-en-minusculas.md'
  } else if (directorio === '6-investigacion/spikes' || directorio === '6-investigacion/archivo') {
    valido = NOMBRE_FECHADO.test(nombre)
    forma = 'YYYY-MM-DD-slug.md'
  } else if (directorio === '3-ingenieria/contratos') {
    valido = NOMBRE_CONTRATO.test(nombre)
    forma = 'NOMBRE-vN.md'
  } else {
    valido = NOMBRE_GENERAL.test(nombre)
    forma = 'MAYUSCULAS-CON-GUIONES.md, sin acentos'
  }

  if (!valido) {
    error('8 · nombres', doc.ruta, `no sigue la forma \`${forma}\` que exige CANON §7`)
  }
}

// ---------------------------------------------------------------------------
// 9. Numeración de ADR secuencial y sin huecos — CANON §7
// ---------------------------------------------------------------------------

const numerosAdr = documentos
  .filter((d) => d.rutaCorpus.startsWith('4-decisiones/') && d.nombreFichero.startsWith('ADR-'))
  .map((d) => Number(d.nombreFichero.slice(4, 8)))
  .sort((a, b) => a - b)

numerosAdr.forEach((numero, indice) => {
  const esperado = indice + 1
  if (numero !== esperado) {
    error(
      '9 · numeración ADR',
      '4-decisiones/',
      `se esperaba ADR-${String(esperado).padStart(4, '0')} y hay ADR-${String(numero).padStart(4, '0')}`,
    )
  }
})

// ---------------------------------------------------------------------------
// 10. Directorios del corpus anunciados y no creados
// ---------------------------------------------------------------------------

const CODIGO_EN_LINEA = /`([^`\n]+)`/g
const RUTA_DEL_CORPUS = /^(?:marbella-os\/|\.generated\/|[1-6]-[a-z]+\/)/
// Un índice describe el contenido de su propio directorio, así que un
// subdirectorio suelto entre comas invertidas se interpreta relativo a él.
const SUBDIRECTORIO_SUELTO = /^[a-z][a-z0-9-]*\/$/

for (const doc of conFrontMatter) {
  if (!esNormativo(doc)) continue
  const esIndice = doc.nombreFichero === 'README.md'

  const anunciados = new Set<string>()
  for (const coincidencia of doc.contenido.matchAll(CODIGO_EN_LINEA)) {
    const texto = coincidencia[1].trim()
    if (!texto.endsWith('/')) continue
    if (RUTA_DEL_CORPUS.test(texto) || (esIndice && SUBDIRECTORIO_SUELTO.test(texto))) {
      anunciados.add(texto)
    }
  }

  for (const anunciado of anunciados) {
    // Un subdirectorio suelto puede referirse al del propio índice o a uno de
    // la raíz del repositorio, como `integrations/`. Basta con que resuelva en
    // alguno de los dos: ante la duda, no se bloquea.
    const candidatos = anunciado.startsWith('marbella-os/')
      ? [resolve(process.cwd(), anunciado)]
      : RUTA_DEL_CORPUS.test(anunciado)
        ? [join(CORPUS_ROOT, anunciado)]
        : [resolve(dirname(doc.rutaAbsoluta), anunciado), resolve(process.cwd(), anunciado)]

    if (!candidatos.some(existe)) {
      error('10 · directorios', doc.ruta, `anuncia \`${anunciado}\` y no existe`)
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Derivados sincronizados con su origen — CANON §10
// ---------------------------------------------------------------------------

if (!existe(GENERATED_DIR)) {
  error(
    '11 · derivados',
    'marbella-os/.generated/',
    'CANON §10 declara este directorio y no existe: ejecuta `npm run generate:corpus`',
  )
} else {
  const esperados = construirDerivados()
  const enDisco = new Set(readdirSync(GENERATED_DIR))

  for (const derivado of esperados) {
    const ruta = `marbella-os/.generated/${derivado.nombre}`
    enDisco.delete(derivado.nombre)

    const rutaAbsoluta = join(GENERATED_DIR, derivado.nombre)
    if (!existe(rutaAbsoluta)) {
      error('11 · derivados', ruta, 'falta: ejecuta `npm run generate:corpus`')
      continue
    }
    // Comparar contra el contenido regenerado detecta las dos formas de
    // desincronización: la edición a mano y el cambio de la fuente sin regenerar.
    if (readFileSync(rutaAbsoluta, 'utf8') !== derivado.contenido) {
      error(
        '11 · derivados',
        ruta,
        'no coincide con lo que produce el generador: se ha editado a mano o su origen cambió. Ejecuta `npm run generate:corpus`',
      )
    }
  }

  for (const sobrante of enDisco) {
    error(
      '11 · derivados',
      `marbella-os/.generated/${sobrante}`,
      'ningún generador lo produce: es un fichero huérfano',
    )
  }
}

// ---------------------------------------------------------------------------
// 12. Cobertura del manifiesto de indexación — CANON §11
//
// Un directorio con markdown que nadie ha clasificado acaba en el índice de
// cualquier agente. El manifiesto obliga a decidirlo una vez, por escrito.
// Las exclusiones preventivas (espejos de herramientas) no se comprueban
// contra el disco: se declaran aunque el espejo aún no esté instalado.
// ---------------------------------------------------------------------------

const manifiesto = leerManifiesto()

if (manifiesto.error !== null) {
  error('12 · manifiesto', 'INDEXACION.md', manifiesto.error)
} else {
  for (const hallazgo of comprobarManifiesto(manifiesto)) {
    error(hallazgo.comprobacion, hallazgo.documento, hallazgo.detalle)
  }
}

// ---------------------------------------------------------------------------
// 13. Identidad de afirmación — ADR-0003
//
// Un identificador que se puede citar tiene que existir, ser único y vivir en
// un documento que autorice algo. Si no, citar deja de ser más barato que
// copiar, y CANON §5 pierde su única alternativa práctica.
// ---------------------------------------------------------------------------

const declaraciones = new Map<string, Declaracion>()

for (const doc of conFrontMatter) {
  for (const declaracion of extraerDeclaraciones(doc)) {
    if (!PATRON_ID.test(declaracion.id)) {
      error(
        '13 · afirmaciones',
        `${doc.ruta}:${declaracion.linea}`,
        `\`${declaracion.id}\` no tiene la forma \`INV-X00\` ni \`AF-NOMBRE-EN-MAYUSCULAS\``,
      )
      continue
    }

    if (!esNormativo(doc)) {
      error(
        '13 · afirmaciones',
        `${doc.ruta}:${declaracion.linea}`,
        `declara \`${declaracion.id}\` sin ser normativo: lo que no autoriza nada no puede citarse`,
      )
      continue
    }

    const previa = declaraciones.get(declaracion.id)
    if (previa !== undefined) {
      error(
        '13 · afirmaciones',
        `${doc.ruta}:${declaracion.linea}`,
        `\`${declaracion.id}\` ya está declarado en ${previa.documento.ruta}:${previa.linea}`,
      )
      continue
    }

    declaraciones.set(declaracion.id, declaracion)
  }
}

for (const doc of conFrontMatter) {
  if (!esNormativo(doc)) continue
  const yaAvisadas = new Set<string>()

  for (const referencia of extraerReferencias(doc)) {
    if (declaraciones.has(referencia.id) || yaAvisadas.has(referencia.id)) continue
    yaAvisadas.add(referencia.id)
    error(
      '13 · afirmaciones',
      `${doc.ruta}:${referencia.linea}`,
      `cita \`${referencia.id}\` y nadie lo declara`,
    )
  }
}

// ---------------------------------------------------------------------------
// 14. Grafo de dependencias — ADR-0004
// ---------------------------------------------------------------------------

const porNombre = new Map<string, DocumentoCorpus>()

for (const doc of conFrontMatter) {
  const nombre = doc.campos.get('documento')
  if (nombre === undefined) continue

  const previo = porNombre.get(nombre)
  if (previo !== undefined) {
    // El nombre es la clave con la que unos documentos citan a otros. Si se
    // repite, «depende_de: X» deja de tener un destino determinado.
    error('14 · grafo', doc.ruta, `\`documento: ${nombre}\` ya lo usa ${previo.ruta}`)
    continue
  }
  porNombre.set(nombre, doc)
}

const aristas = construirAristas(conFrontMatter)

for (const arista of aristas) {
  if (arista.hacia === arista.desde) {
    error('14 · grafo', arista.origen.ruta, 'declara depender de sí mismo')
    continue
  }

  const destino = porNombre.get(arista.hacia)
  if (destino === undefined) {
    error('14 · grafo', arista.origen.ruta, `depende de \`${arista.hacia}\`, que no existe`)
    continue
  }
  if (destino.campos.get('estado') !== 'vigente') {
    error(
      '14 · grafo',
      arista.origen.ruta,
      `depende de \`${arista.hacia}\`, que está en \`estado: ${destino.campos.get('estado')}\``,
    )
  }
  // Apoyarse en algo que no autoriza nada convierte la norma propia en
  // consecuencia de un material que el propio corpus declara no vinculante.
  if (esNormativo(arista.origen) && !esNormativo(destino)) {
    error(
      '14 · grafo',
      arista.origen.ruta,
      `es normativo y depende de \`${arista.hacia}\`, que no lo es`,
    )
  }
}

const ciclo = buscarCiclo(aristas)
if (ciclo !== null) {
  error(
    '14 · grafo',
    '(dependencias)',
    `ciclo de dependencias: ${ciclo.join(' → ')}. Decide cuál de ellos es dueño del hecho compartido`,
  )
}

// ---------------------------------------------------------------------------
// 15 · limbo — un documento propuesto que nadie aprueba ni descarta
//
// CANON §8 admite `propuesto` como paso, no como destino. Un documento que
// lleva meses ahí no es una propuesta: es una decisión que nadie quiere tomar,
// y mientras tanto no gobierna nada. Es aviso, porque la respuesta correcta
// puede ser aprobarlo o retirarlo, y ninguna máquina puede elegir por nadie.
// ---------------------------------------------------------------------------

const DIAS_DE_LIMBO = 90

for (const doc of conFrontMatter) {
  if (doc.campos.get('estado') !== 'propuesto') continue

  const desde = doc.campos.get('revisado') ?? doc.campos.get('publicado')
  if (desde === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) continue

  const dias = Math.floor(
    (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  )
  if (dias > DIAS_DE_LIMBO) {
    aviso(
      '15 · limbo',
      doc.ruta,
      `lleva ${dias} días en \`propuesto\`: apruébalo, retíralo o admite que no era una propuesta`,
    )
  }
}

// ---------------------------------------------------------------------------
// 16 · norma huérfana — reglas de agente que legislan por su cuenta
//
// CANON §13 clasifica como degradación que una norma viva solo en la
// configuración de una herramienta: no la ve quien no usa esa herramienta y no
// la gobierna nadie. La señal comprobable es que una regla no cite el corpus:
// si no apunta a ningún documento, o repite lo que ya está escrito, o legisla.
// ---------------------------------------------------------------------------

const DIRECTORIO_REGLAS = join(RAIZ_REPO, '.cursor/rules')

if (existe(DIRECTORIO_REGLAS)) {
  for (const nombre of readdirSync(DIRECTORIO_REGLAS).sort()) {
    if (!nombre.endsWith('.mdc')) continue

    const contenido = readFileSync(join(DIRECTORIO_REGLAS, nombre), 'utf8')
    if (contenido.includes('marbella-os/')) continue

    aviso(
      '16 · norma huérfana',
      `.cursor/rules/${nombre}`,
      'no cita ningún documento del corpus: o la norma que aplica está en Marbella OS y debe enlazarla, o solo vive aquí',
    )
  }
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

function imprimir(titulo: string, hallazgos: readonly Hallazgo[]): void {
  const porComprobacion = new Map<string, Hallazgo[]>()
  for (const hallazgo of hallazgos) {
    const grupo = porComprobacion.get(hallazgo.comprobacion) ?? []
    grupo.push(hallazgo)
    porComprobacion.set(hallazgo.comprobacion, grupo)
  }

  console.log(`\n${titulo}`)
  for (const comprobacion of [...porComprobacion.keys()].sort()) {
    const grupo = porComprobacion.get(comprobacion) ?? []
    console.log(`\n  ${comprobacion} — ${grupo.length}`)
    for (const hallazgo of grupo) {
      console.log(`    ${hallazgo.documento}`)
      console.log(`      ${hallazgo.detalle}`)
    }
  }
}

console.log(`Marbella OS · ${documentos.length} documentos`)

if (avisos.length > 0) imprimir(`Avisos (${avisos.length})`, avisos)

if (errores.length === 0) {
  console.log('\nCorpus válido.')
  process.exit(0)
}

imprimir(`Errores (${errores.length})`, errores)
console.log(
  `\n${errores.length} ${errores.length === 1 ? 'error' : 'errores'}. El corpus no cumple CANON.`,
)
process.exit(1)
