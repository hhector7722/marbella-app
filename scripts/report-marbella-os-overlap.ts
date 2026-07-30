/**
 * Informe de solapamiento léxico entre documentos normativos.
 *
 * Busca párrafos que dicen lo mismo con palabras parecidas, que es la forma en
 * que `CANON §5` se incumple en la práctica: nadie copia y pega, alguien
 * reescribe un hecho «para que se entienda aquí».
 *
 * No es una puerta y no forma parte de `validate:corpus`. Es un informe que se
 * lee y se decide, porque la similitud léxica no distingue una duplicación de
 * dos reglas legítimamente parecidas. Convertirlo en error obligaría a fijar un
 * umbral que ninguna evidencia sostiene.
 *
 *   npm run report:overlap [umbral]
 */

import { esNormativo, leerCorpus, type DocumentoCorpus } from './marbella-os/corpus.ts'

const UMBRAL_POR_DEFECTO = 0.5
const MINIMO_PALABRAS = 12
const MAXIMO_PAREJAS = 40

/**
 * Palabras vacías del español. Sin ellas, dos párrafos cualesquiera comparten
 * «de», «la» y «que», y todo se parece a todo.
 */
const VACIAS = new Set(
  `a al algo ante antes aquel aquella aquello asi aun aunque cada como con contra cual cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa ese eso esta estan este esto estos ha hace hacia han hasta hay la las le les lo los mas me mi misma mismo mucho muy nada ni no nos o otra otro para pero poco por porque pues que se sea segun ser si sin sobre solo son su sus tambien tanto te tiene todo todos tras un una uno unos y ya`.split(
    ' ',
  ),
)

interface Parrafo {
  readonly documento: DocumentoCorpus
  readonly linea: number
  readonly texto: string
  readonly palabras: ReadonlySet<string>
}

function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 && !VACIAS.has(p))
}

function extraerParrafos(documento: DocumentoCorpus): Parrafo[] {
  const parrafos: Parrafo[] = []
  let acumulado: string[] = []
  let inicio = 0
  let enCodigo = false

  const cerrar = (): void => {
    if (acumulado.length === 0) return
    const texto = acumulado.join(' ')
    const palabras = new Set(normalizar(texto))
    if (palabras.size >= MINIMO_PALABRAS) {
      parrafos.push({ documento, linea: inicio, texto, palabras })
    }
    acumulado = []
  }

  // Desde el cuerpo: el front-matter de dos documentos cualesquiera es casi
  // idéntico por diseño, y compararlo solo produce ruido.
  const lineas = documento.contenido.split('\n').slice(documento.lineaCuerpo - 1)

  lineas.forEach((linea, desplazamiento) => {
    const indice = desplazamiento + documento.lineaCuerpo - 1
    if (linea.trimStart().startsWith('```')) {
      enCodigo = !enCodigo
      cerrar()
      return
    }
    if (enCodigo || linea.trim() === '' || linea.startsWith('#')) {
      cerrar()
      return
    }
    if (acumulado.length === 0) inicio = indice + 1
    acumulado.push(linea)
  })
  cerrar()

  return parrafos
}

/** Jaccard sobre palabras significativas. Barato, determinista y explicable. */
function similitud(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let comunes = 0
  for (const palabra of a) {
    if (b.has(palabra)) comunes++
  }
  return comunes / (a.size + b.size - comunes)
}

const umbral = Number(process.argv[2] ?? UMBRAL_POR_DEFECTO)
if (!Number.isFinite(umbral) || umbral <= 0 || umbral >= 1) {
  console.error(`Umbral inválido: «${process.argv[2]}». Debe estar entre 0 y 1.`)
  process.exit(1)
}

const documentos = leerCorpus().filter(
  (d) => d.tieneFrontMatter && d.errorFrontMatter === null && esNormativo(d),
)
const parrafos = documentos.flatMap(extraerParrafos)

interface Pareja {
  readonly a: Parrafo
  readonly b: Parrafo
  readonly similitud: number
}

const parejas: Pareja[] = []
for (let i = 0; i < parrafos.length; i++) {
  for (let j = i + 1; j < parrafos.length; j++) {
    // Dentro de un mismo documento no hay conflicto de dueño: hay repetición
    // retórica, que es problema de redacción y no de arquitectura.
    if (parrafos[i].documento.rutaCorpus === parrafos[j].documento.rutaCorpus) continue
    const valor = similitud(parrafos[i].palabras, parrafos[j].palabras)
    if (valor >= umbral) parejas.push({ a: parrafos[i], b: parrafos[j], similitud: valor })
  }
}

parejas.sort((x, y) => y.similitud - x.similitud)

console.log(
  `Marbella OS · ${documentos.length} documentos normativos, ${parrafos.length} párrafos comparables`,
)
console.log(`Umbral de similitud: ${umbral}\n`)

if (parejas.length === 0) {
  console.log('Ningún par de párrafos de documentos distintos supera el umbral.')
  process.exit(0)
}

console.log(`${parejas.length} ${parejas.length === 1 ? 'pareja' : 'parejas'} por encima del umbral.`)
console.log('Cada una es una pregunta, no un defecto: ¿son el mismo hecho escrito dos veces?\n')

for (const pareja of parejas.slice(0, MAXIMO_PAREJAS)) {
  const recorte = (parrafo: Parrafo): string =>
    parrafo.texto.replace(/\s+/g, ' ').trim().slice(0, 160)

  console.log(`  ${(pareja.similitud * 100).toFixed(0)} %`)
  console.log(`    ${pareja.a.documento.ruta}:${pareja.a.linea}`)
  console.log(`      ${recorte(pareja.a)}`)
  console.log(`    ${pareja.b.documento.ruta}:${pareja.b.linea}`)
  console.log(`      ${recorte(pareja.b)}\n`)
}

if (parejas.length > MAXIMO_PAREJAS) {
  console.log(`… y ${parejas.length - MAXIMO_PAREJAS} más. Sube el umbral para ver solo las peores.`)
}

console.log(
  'Si dos párrafos afirman el mismo hecho, decide el dueño (CANON §5), dale un\nidentificador (ADR-0003) y cita desde el otro.',
)
