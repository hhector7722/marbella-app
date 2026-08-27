/**
 * Regenera los 4 manuales de staff con el estilo de documentos impresos
 * (Marbella PDF Design System v2.0). El texto y las fotografías se copian
 * literalmente del original; solo cambia color, tipo, retícula y filetes.
 *
 * Uso:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/generate-staff-manuals.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, registerFont, type Image, type SKRSContext2D } from 'canvas'
import { jsPDF } from 'jspdf'
import sharp from 'sharp'
import { DS_PAGE, DS_RGB, DS_SPACE, DS_TYPE } from '../src/lib/pdf/design-system-v2/tokens.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'tmp/manuals-source')
const ASSETS = join(ROOT, 'tmp/manual-assets')
const OUT = join(ROOT, 'public/docs/manuals')

const FONT_REG = '/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf'
const FONT_BOLD = '/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf'

type CheckItem = {
  text: string
  box: boolean
  gapBefore?: boolean
  emphasize?: string
}

function item(text: string, box = true, extra?: Partial<CheckItem>): CheckItem {
  return { text, box, ...extra }
}
function blank(box = true): CheckItem {
  return { text: '', box }
}

const APERTURA = {
  barra: [
    item('Encendre llums'),
    item('Obrir persiana interior i treure seguros'),
    item('Encendre molinets café (sota la tapa negra)'),
    item('Posar catifes antideslliçants de barra i pica'),
    item('Obrir torn tpv amb la data correcte'),
    item('Obrir porta corredera interior'),
    item('Escórrer les baietes dia anterior i estendre-les'),
    item('Guardar les baietes secas del dia anterior'),
    item('Posar taps als rentavaixelles i encendre\'ls'),
    item('Ja oberts, anar comprobant que tot estigui cargat'),
    item('Reposar el que no ho estigui'),
    item('Fer produccions necessaries'),
    item('Fer mice & place per els serveis d\'esmorzar i dinar'),
    item('Mantenir la barra i vaixella neta (pulir gots)'),
    item('Mantenir pica neta'),
    blank(),
    blank(),
  ],
  terrassa: [
    item('Treure escombraries'),
    item('Obrir toldo barra (i taules segons clima)'),
    item('Netejar la barra per fora'),
    item('Repasar amb bayeta humida taules i cadires'),
    item('Treure totes les cagades d\'ocells'),
    item('Colocar taules i cadires al seu lloc si no ho estan'),
    item('Comprobar si el terra està escombrat'),
    item('Escombrar-lo si no ho està'),
    item('Obrir lavabo'),
    item('Mantenir la sala neta (taules, cadires i terra)'),
    item('Recollir vaixella de les taules on no hi hagui clients'),
    item('Mantenir les taules i cadires al seu lloc'),
    item('Anar sortint per repassar les cagades d\'ocells'),
    blank(),
    blank(),
  ],
  cuina: [
    item('Pujar ploms'),
    item('Encendre forn i posar-lo a calentar a 180º'),
    item('Amb el forn ja calent afegir safates de pà i pastes'),
    item('Programar pà a 17 minuts i pastes a 16 minuts'),
    item('Encendre planxa a 150º'),
    item('Encendre fregidores a 180º'),
    item('Encendre salamandra al màxim'),
    item('Comprobar productes necessaris', true, { gapBefore: true }),
    item('Fer produccions necessaries'),
    item('Fer mice & place dels serveis d\'esmorzar i dinar'),
    item('Mantenir pica neta'),
    blank(),
    blank(),
    blank(),
  ],
  altres: [
    item('Tasques per quan el vòlum de feina es baix', false),
    item('Manteniment i neteja de les càmares', false),
    item('Manteniment i neteja darrera les neveres', false),
    item('Neteja de burilles als testos de la terrassa', false),
    item('Repàs de gots i coberts (pulir si és necessari)', false),
    item('Neteja alfombres secaplats de la pica', false),
  ],
  observacions: [
    item('Dinar a les taules de fusta. MAI a les cadires', false, { emphasize: 'MAI' }),
    item('No seure a les neveres', false),
    item('Actitud proactiva a la barra', false),
    item('No utilitzar telèfon ni auriculars', false),
    item('Música només permesa a cuina i pica', false),
    item('MAI a un vólum audible per al client', false, { emphasize: 'MAI' }),
    blank(false),
  ],
} as const

const TANCAMENT = {
  barra: [
    item('Netejar i col·locar vaixella'),
    item('Netejar cafetera (apagar molinets i buidar calaix)'),
    item('Cargar neveres en l\'ordre correcte'),
    item('Cargar patates, snacks, sucre, gots, llets y café'),
    item('Deixar draps en remull (separant cuina i sala)'),
    item('Netejar superficies'),
    item('Reposar dispensador de paper secamans si no hi ha'),
    item('Buidar ( treure tap) i APAGAR rentavaixelles'),
    item('Deixar datafón carregant'),
    item('Llençar escombraries (cartrons plegats)'),
    item('Tancar porta corredera interior'),
    item('Escombrar i fregar (buidar cubell de fregar)'),
    item('Entregar informes i efectiu del tancament de caixa'),
    item('Tancar llums (final despatx i columna claus lavabo)'),
    item('Tancar amb clau el bar'),
    blank(),
    blank(),
    blank(),
  ],
  terrassa: [
    item('Retirar toldo barra i plegar els de les taules'),
    item('Recollir vaixella de les taules'),
    item('Netejar taules amb bayeta humida (caca ocells)'),
    item('Colocar taules i cadires al seu lloc'),
    item('Escombrar terra (comprobar zona entrada i cadires)'),
    item('Retirar escombraries (posar bosses noves)'),
    item('Apagar llum terrassa (diferencial on les taules picnick)'),
    item('Baixar reixa exterior'),
    item('Posar seguro reixa exterior (per dins de la barra)'),
    item('Baixar reixa interior (interruptor al costat de cafetera)'),
    item('Tancar amb clau porta d\'accés a la terrassa'),
    blank(),
    blank(),
    blank(),
    blank(),
    blank(),
    blank(),
    blank(),
  ],
  cuina: [
    item('Netejar màquina de tallar'),
    item('Netejar safata salamandra'),
    item('Netejar superfícies'),
    item('Apagar i netejar zona fregidores'),
    item('Cambiar oli fregidores si es necessari'),
    item('Netejar microones exterior i interior'),
    item('Reposar dispensador de paper secamans si no hi ha'),
    item('Baixar ploms marcats amb "x" al quadre de elèctric'),
    item('Escombrar i fregar terra (buidar cubell de fregar)'),
    blank(),
    blank(),
    blank(),
  ],
  observacions: [
    item('Comprobar no deixar menjar (pa, croissants, etc)', false),
    blank(false),
    blank(false),
    blank(false),
    blank(false),
    blank(false),
    blank(false),
    blank(false),
    blank(false),
  ],
} as const

const HORNO = {
  title: 'Instrucciones de Lavado Automático del Horno',
  paso1: 'Paso 1: Saber si es necesario recargar la bomba de detergente',
  cuando: 'Cuándo hacer recarga:',
  recargaCuando: [
    'Tras el primer encendido después de la instalación.',
    'Cada vez que se agote el detergente.',
    'Después de largos periodos de inactividad.',
  ],
  paraHacerla: 'Para hacerla, ejecuta el programa CHr y sigue los pasos siguientes:',
  recargaPasos: [
    '▸ Asegúrate de que el horno está apagado.',
    '▸ Enciéndelo.',
    '▸ Pulsa el asa giratoria (botón grande redondo).',
    '▸ En la pantalla aparecerá el programa predeterminado CLN 01.',
    '▸ Selecciona el programa deseado girando el asa giratoria.',
    '▸ En este caso, selecciona el programa CHr para hacer la recarga.',
    '▸ Vuelve a presionar el asa para iniciar el programa.',
    '▹ Duración de la recarga: 3 minutos.',
  ],
  paso2: 'Paso 2: Seleccionar el programa de lavado',
  programas: [
    '▸ CLN 01: Lavado CORTO (45 minutos).',
    '▸ CLN 02: Lavado MEDIO (56 minutos).',
    '▸ CLN 03: Lavado LARGO (65 minutos).',
    '▸ CHr: Recarga de la bomba de detergente (3 minutos).',
  ],
  recsTitle: 'Recomendaciones para el lavado',
  recs: [
    { text: '▸Limpiar con el horno entre 90º y 140º para cualquier programa (excepto el de recarga)', grayTail: '(excepto el de recarga)' },
    { text: '▸Evitar temperaturas superiore, podrían afectar al funcionamiento.' },
  ],
} as const

const LLUVIA = {
  steps: [
    { n: 1, title: 'ENTRAR BASURAS Y ALTAVOCES', photo: 'speaker.png', rounded: false },
    { n: 2, title: 'SUBIR SILLAS, BANCOS Y CERRAR SOMBRILLAS', photo: 'terrace.png', rounded: true },
  ],
  step3: {
    n: 3,
    title: 'COLOCACIÓN CORRECTA DE LAS SILLAS',
    incorrectLabel: 'INCORRECTO',
    incorrectCaption:
      'Silla mal colocada. Si no se coloca bien, el viento la moverá y la dejará como estaba (o la tirará).',
    correctLabel: 'CORRECTO',
    correctCaption: 'Silla girada y colgada para estabilidad contra el viento.',
  },
  step4: { n: 4, title: 'MONTAR MESAS EN MÓDULOS', photo: 'modules.png', rounded: true },
} as const

const CUADRO = {
  title: 'Acceso al cuadro general de luces del bar',
  steps: [
    { n: 1, text: 'Dirígete al cuarto eléctrico de la planta -1', photo: 'hall.png' },
    { n: 2, text: 'Localiza el cuadro eléctrico del bar', photo: 'cabinets.png' },
    { n: 3, text: 'Sube los plomos', photo: 'panel.png' },
  ],
} as const

function rgbCss(rgb: readonly [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

function drawCheckbox(doc: jsPDF, x: number, y: number, size = 7): void {
  doc.setDrawColor(...DS_RGB.grayMid)
  doc.setLineWidth(DS_PAGE.hairline)
  doc.rect(x, y - size + 1.5, size, size)
}

function drawItemLine(
  doc: jsPDF,
  item: CheckItem,
  x: number,
  y: number,
  colW: number,
): number {
  const rowH = item.gapBefore ? DS_SPACE.md + 4 : DS_SPACE.md
  const textW = colW - (item.box ? 16 : 4)
  const boxX = x + colW - 9
  const lineY = y + 3

  if (item.text) {
    doc.setFont(DS_TYPE.fontFamily, 'normal')
    doc.setFontSize(DS_TYPE.caption)
    if (item.emphasize) {
      drawEmphasized(doc, item.text, item.emphasize, x, y, textW)
    } else {
      doc.setTextColor(...DS_RGB.grayDark)
      const lines = doc.splitTextToSize(item.text, textW) as string[]
      doc.text(lines[0] ?? '', x, y)
    }
  }

  doc.setDrawColor(...DS_RGB.grayLight)
  doc.setLineWidth(DS_PAGE.hairline)
  doc.line(x, lineY + 4, x + colW - (item.box ? 14 : 0), lineY + 4)

  if (item.box) {
    drawCheckbox(doc, boxX, y)
  }

  return y + rowH
}

function drawEmphasized(
  doc: jsPDF,
  full: string,
  word: string,
  x: number,
  y: number,
  _maxW: number,
): void {
  const idx = full.indexOf(word)
  if (idx < 0) {
    doc.setTextColor(...DS_RGB.grayDark)
    doc.text(full, x, y)
    return
  }
  const before = full.slice(0, idx)
  const after = full.slice(idx + word.length)
  let cx = x
  doc.setFont(DS_TYPE.fontFamily, 'normal')
  doc.setFontSize(DS_TYPE.caption)
  if (before) {
    doc.setTextColor(...DS_RGB.grayDark)
    doc.text(before, cx, y)
    cx += doc.getTextWidth(before)
  }
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setTextColor(...DS_RGB.alertError)
  doc.text(word, cx, y)
  cx += doc.getTextWidth(word)
  if (after) {
    doc.setFont(DS_TYPE.fontFamily, 'normal')
    doc.setTextColor(...DS_RGB.grayDark)
    doc.text(after, cx, y)
  }
}

function drawSectionHeader(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
  w: number,
  kind: 'brand' | 'warning',
): number {
  const h = 18
  if (kind === 'brand') {
    doc.setFillColor(...DS_RGB.brand)
    doc.rect(x, y, w, h, 'F')
    doc.setTextColor(...DS_RGB.white)
  } else {
    doc.setFillColor(...DS_RGB.alertWarningBg)
    doc.rect(x, y, w, h, 'F')
    doc.setTextColor(...DS_RGB.grayDark)
  }
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.caption)
  doc.text(title, x + w / 2, y + 12, { align: 'center' })
  return y + h + 8
}

function drawBanner(doc: jsPDF, title: string, subtitle: string): number {
  const { width } = DS_PAGE
  doc.setFillColor(...DS_RGB.brand)
  doc.rect(0, 0, width, 36, 'F')
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.subtitle)
  doc.setTextColor(...DS_RGB.white)
  doc.text(title, width / 2, 24, { align: 'center' })

  doc.setFillColor(...DS_RGB.alertInfoBg)
  doc.rect(0, 36, width, 22, 'F')
  doc.setFont(DS_TYPE.fontFamily, 'bold')
  doc.setFontSize(DS_TYPE.body)
  doc.setTextColor(...DS_RGB.grayDark)
  doc.text(subtitle, width / 2, 51, { align: 'center' })
  return 70
}

function drawCheckColumn(
  doc: jsPDF,
  title: string,
  items: readonly CheckItem[],
  x: number,
  y: number,
  colW: number,
  kind: 'brand' | 'warning',
): number {
  let cy = drawSectionHeader(doc, title, x, y, colW, kind)
  for (const it of items) {
    cy = drawItemLine(doc, it, x, cy, colW)
  }
  return cy
}

function generateCheckListPdf(): Buffer {
  const doc = new jsPDF({
    orientation: DS_PAGE.orientation,
    unit: DS_PAGE.unit,
    format: DS_PAGE.format,
  })
  const gutter = DS_SPACE.md
  const colW = (DS_PAGE.width - DS_PAGE.marginX * 2 - gutter) / 2
  const left = DS_PAGE.marginX
  const right = DS_PAGE.marginX + colW + gutter

  let y = drawBanner(doc, 'CHECK LIST', 'APERTURA')
  drawCheckColumn(doc, 'BARRA', APERTURA.barra, left, y, colW, 'brand')
  drawCheckColumn(doc, 'TERRASSA', APERTURA.terrassa, right, y, colW, 'brand')
  const y2 = 400
  drawCheckColumn(doc, 'CUINA', APERTURA.cuina, left, y2, colW, 'brand')
  const yAlt = drawCheckColumn(doc, 'ALTRES', APERTURA.altres, right, y2, colW, 'warning')
  drawCheckColumn(doc, 'OBSERVACIONS', APERTURA.observacions, right, yAlt + DS_SPACE.sm, colW, 'warning')

  doc.addPage()
  y = drawBanner(doc, 'CHECK LIST', 'TANCAMENT')
  drawCheckColumn(doc, 'BARRA', TANCAMENT.barra, left, y, colW, 'brand')
  drawCheckColumn(doc, 'TERRASSA', TANCAMENT.terrassa, right, y, colW, 'brand')
  const y3 = 430
  drawCheckColumn(doc, 'CUINA', TANCAMENT.cuina, left, y3, colW, 'brand')
  drawCheckColumn(doc, 'OBSERVACIONS', TANCAMENT.observacions, right, y3, colW, 'warning')

  return Buffer.from(doc.output('arraybuffer'))
}

const FONT_NAME = 'LiberationSans'

function embedManualFont(doc: jsPDF): void {
  doc.addFileToVFS('LiberationSans-Regular.ttf', readFileSync(FONT_REG).toString('base64'))
  doc.addFileToVFS('LiberationSans-Bold.ttf', readFileSync(FONT_BOLD).toString('base64'))
  doc.addFont('LiberationSans-Regular.ttf', FONT_NAME, 'normal')
  doc.addFont('LiberationSans-Bold.ttf', FONT_NAME, 'bold')
  doc.setFont(FONT_NAME, 'normal')
}

function generateHornoPdf(): Buffer {
  const doc = new jsPDF({
    orientation: DS_PAGE.orientation,
    unit: DS_PAGE.unit,
    format: DS_PAGE.format,
  })
  embedManualFont(doc)
  const x = DS_PAGE.marginX
  const maxW = DS_PAGE.width - DS_PAGE.marginX * 2

  doc.setFont(FONT_NAME, 'bold')
  doc.setFontSize(DS_TYPE.section)
  doc.setTextColor(...DS_RGB.brand)
  const titleLines = doc.splitTextToSize(HORNO.title, maxW) as string[]
  doc.text(titleLines, DS_PAGE.width / 2, 56, { align: 'center' })

  let y = 88

  const drawPaso = (title: string) => {
    doc.setFont(FONT_NAME, 'bold')
    doc.setFontSize(DS_TYPE.subtitle)
    doc.setTextColor(...DS_RGB.brand)
    doc.text(title, x, y)
    y += DS_SPACE.lg
  }

  const drawBody = (text: string) => {
    doc.setFont(FONT_NAME, 'normal')
    doc.setFontSize(DS_TYPE.body)
    doc.setTextColor(...DS_RGB.grayDark)
    doc.text(text, x + 8, y)
    y += DS_SPACE.md
  }

  const drawMarker = (kind: 'dot' | 'filled' | 'outline', bx: number) => {
    if (kind === 'dot') {
      doc.setFillColor(...DS_RGB.grayDark)
      doc.circle(bx + 1.6, y - 1.2, 1.15, 'F')
      return
    }
    const s = 3.1
    if (kind === 'outline') {
      doc.setDrawColor(...DS_RGB.grayDark)
      doc.setLineWidth(0.6)
      doc.triangle(bx, y - s, bx, y + s, bx + s * 1.7, y, 'S')
    } else {
      doc.setFillColor(...DS_RGB.grayDark)
      doc.triangle(bx, y - s, bx, y + s, bx + s * 1.7, y, 'F')
    }
  }

  const drawBullet = (text: string, indent = 20) => {
    doc.setFont(FONT_NAME, 'normal')
    doc.setFontSize(DS_TYPE.body)
    doc.setTextColor(...DS_RGB.grayDark)
    let kind: 'dot' | 'filled' | 'outline' | null = null
    let body = text
    if (text.startsWith('▸')) {
      kind = 'filled'
      body = text.slice(1)
    } else if (text.startsWith('▹')) {
      kind = 'outline'
      body = text.slice(1)
    } else if (text.startsWith('•')) {
      kind = 'dot'
      body = text.slice(1)
    }
    const bx = x + indent
    if (kind) {
      drawMarker(kind, bx)
      doc.text(body, bx + 10, y)
    } else {
      doc.text(body, bx, y)
    }
    y += 18
  }

  drawPaso(HORNO.paso1)
  drawBody(HORNO.cuando)
  y += 4
  for (const line of HORNO.recargaCuando) {
    drawBullet(`•  ${line}`, 24)
  }
  y += 8
  drawBody(HORNO.paraHacerla)
  y += 4
  for (const line of HORNO.recargaPasos) {
    drawBullet(line, 20)
  }

  y += DS_SPACE.sm
  drawPaso(HORNO.paso2)
  for (const line of HORNO.programas) {
    drawBullet(line, 20)
  }

  y += DS_SPACE.sm
  drawPaso(HORNO.recsTitle)
  for (const rec of HORNO.recs) {
    if (rec.grayTail) {
      const raw = rec.text.startsWith('▸') || rec.text.startsWith('▹') ? rec.text.slice(1) : rec.text
      const head = raw.slice(0, raw.indexOf(rec.grayTail))
      drawMarker(rec.text.startsWith('▹') ? 'outline' : 'filled', x + 20)
      doc.setFont(FONT_NAME, 'normal')
      doc.setFontSize(DS_TYPE.body)
      doc.setTextColor(...DS_RGB.grayDark)
      doc.text(head, x + 30, y)
      const hw = doc.getTextWidth(head)
      doc.setTextColor(...DS_RGB.grayMid)
      doc.text(rec.grayTail, x + 30 + hw, y)
      y += 18
    } else {
      drawBullet(rec.text, 20)
    }
  }

  return Buffer.from(doc.output('arraybuffer'))
}

type Crop = { left: number; top: number; width: number; height: number }

async function cropPng(src: string, dest: string, box: Crop): Promise<void> {
  await sharp(src).extract(box).png().toFile(dest)
}

async function extractPhotos(): Promise<void> {
  mkdirSync(ASSETS, { recursive: true })
  const lluvia = join(SOURCE, 'cambios-lluvia.png')
  const cuadro = join(SOURCE, 'cuadro-electrico.png')
  await Promise.all([
    cropPng(lluvia, join(ASSETS, 'speaker.png'), { left: 680, top: 92, width: 124, height: 193 }),
    cropPng(lluvia, join(ASSETS, 'terrace.png'), { left: 463, top: 350, width: 520, height: 312 }),
    cropPng(lluvia, join(ASSETS, 'chair-bad.png'), { left: 416, top: 740, width: 264, height: 202 }),
    cropPng(lluvia, join(ASSETS, 'chair-good.png'), { left: 692, top: 739, width: 274, height: 203 }),
    cropPng(lluvia, join(ASSETS, 'modules.png'), { left: 449, top: 1160, width: 512, height: 304 }),
    cropPng(cuadro, join(ASSETS, 'hall.png'), { left: 303, top: 167, width: 514, height: 432 }),
    cropPng(cuadro, join(ASSETS, 'cabinets.png'), { left: 302, top: 691, width: 520, height: 436 }),
    cropPng(cuadro, join(ASSETS, 'panel.png'), { left: 304, top: 1223, width: 517, height: 463 }),
  ])
}

const PX = 2
const PAGE_W = Math.round(DS_PAGE.width * PX)
const PAGE_H = Math.round(DS_PAGE.height * PX)
const MX = DS_PAGE.marginX * PX
const MY = DS_PAGE.marginY * PX

function registerManualFonts(): void {
  registerFont(FONT_REG, { family: 'DSSans', weight: 'normal' })
  registerFont(FONT_BOLD, { family: 'DSSans', weight: 'bold' })
}

function roundRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawHairline(ctx: SKRSContext2D, y: number): void {
  ctx.strokeStyle = rgbCss(DS_RGB.grayLight)
  ctx.lineWidth = DS_PAGE.hairline * PX
  ctx.beginPath()
  ctx.moveTo(MX, y)
  ctx.lineTo(PAGE_W - MX, y)
  ctx.stroke()
}

function drawNumber(ctx: SKRSContext2D, n: number, x: number, y: number, d: number): void {
  ctx.fillStyle = rgbCss(DS_RGB.brand)
  ctx.beginPath()
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rgbCss(DS_RGB.white)
  ctx.font = `bold ${Math.round(d * 0.52)}px DSSans`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), x + d / 2, y + d / 2 + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function wrapCanvas(ctx: SKRSContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= maxW) {
      cur = next
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function drawCoverImage(
  ctx: SKRSContext2D,
  img: Image,
  x: number,
  y: number,
  w: number,
  h: number,
  rounded: boolean,
): void {
  ctx.save()
  if (rounded) {
    roundRectPath(ctx, x, y, w, h, 8 * PX)
    ctx.clip()
  }
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

async function generateCambiosLluviaPng(): Promise<Buffer> {
  const [speaker, terrace, chairBad, chairGood, modules] = await Promise.all([
    loadImage(join(ASSETS, 'speaker.png')),
    loadImage(join(ASSETS, 'terrace.png')),
    loadImage(join(ASSETS, 'chair-bad.png')),
    loadImage(join(ASSETS, 'chair-good.png')),
    loadImage(join(ASSETS, 'modules.png')),
  ])
  const canvas = createCanvas(PAGE_W, PAGE_H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = rgbCss(DS_RGB.white)
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  const circle = 28 * PX
  const contentW = PAGE_W - MX * 2
  const photoW = contentW * 0.46
  const textColW = contentW - photoW - DS_SPACE.md * PX
  const bodyTop = MY
  const bodyH = PAGE_H - MY * 2
  const weights = [0.2, 0.23, 0.34, 0.23]
  const tops: number[] = []
  const heights: number[] = []
  let acc = bodyTop
  for (const w of weights) {
    const h = bodyH * w
    tops.push(acc)
    heights.push(h)
    acc += h
  }

  const drawSimpleStep = (
    n: number,
    title: string,
    img: Image,
    y0: number,
    h: number,
    rounded: boolean,
    contain: boolean,
  ) => {
    const mid = y0 + h / 2
    drawNumber(ctx, n, MX, mid - circle / 2, circle)
    ctx.fillStyle = rgbCss(DS_RGB.grayDark)
    ctx.font = `bold ${13 * PX}px DSSans`
    const lines = wrapCanvas(ctx, title, textColW - circle - DS_SPACE.sm * PX)
    const lineH = 17 * PX
    const textX = MX + circle + DS_SPACE.sm * PX
    const textY = mid - ((lines.length - 1) * lineH) / 2 + 4
    lines.forEach((line, i) => {
      ctx.fillText(line, textX, textY + i * lineH)
    })
    const imgH = h - DS_SPACE.md * PX
    const imgX = PAGE_W - MX - photoW
    const imgY = y0 + (h - imgH) / 2
    if (contain) {
      const scale = Math.min(photoW / img.width, imgH / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, imgX + photoW - dw, imgY + (imgH - dh) / 2, dw, dh)
    } else {
      drawCoverImage(ctx, img, imgX, imgY, photoW, imgH, rounded)
    }
  }

  drawSimpleStep(1, LLUVIA.steps[0].title, speaker, tops[0], heights[0], false, true)
  drawHairline(ctx, tops[1])
  drawSimpleStep(2, LLUVIA.steps[1].title, terrace, tops[1], heights[1], true, false)
  drawHairline(ctx, tops[2])

  const y3 = tops[2]
  const h3 = heights[2]
  drawNumber(ctx, 3, MX, y3 + DS_SPACE.sm * PX, circle)
  ctx.fillStyle = rgbCss(DS_RGB.grayDark)
  ctx.font = `bold ${13 * PX}px DSSans`
  const title3W = contentW - circle - DS_SPACE.sm * PX
  const t3 = wrapCanvas(ctx, LLUVIA.step3.title, title3W)
  t3.forEach((line, i) => {
    ctx.fillText(line, MX + circle + DS_SPACE.sm * PX, y3 + 22 * PX + i * 17 * PX)
  })

  const captionBlock = 52 * PX
  const pairY = y3 + 40 * PX
  const pairH = h3 - 40 * PX - captionBlock
  const pairW = (contentW - DS_SPACE.md * PX) / 2
  const leftX = MX
  const rightX = MX + pairW + DS_SPACE.md * PX
  drawCoverImage(ctx, chairBad, leftX, pairY, pairW, pairH, true)
  drawCoverImage(ctx, chairGood, rightX, pairY, pairW, pairH, true)

  ctx.textAlign = 'center'
  ctx.font = `bold ${10 * PX}px DSSans`
  ctx.fillStyle = rgbCss(DS_RGB.alertError)
  ctx.fillText(LLUVIA.step3.incorrectLabel, leftX + pairW / 2, pairY + pairH + 14 * PX)
  ctx.fillStyle = rgbCss(DS_RGB.alertSuccess)
  ctx.fillText(LLUVIA.step3.correctLabel, rightX + pairW / 2, pairY + pairH + 14 * PX)

  ctx.font = `normal ${9 * PX}px DSSans`
  ctx.fillStyle = rgbCss(DS_RGB.grayDark)
  wrapCanvas(ctx, LLUVIA.step3.incorrectCaption, pairW - 8 * PX).forEach((line, i) => {
    ctx.fillText(line, leftX + pairW / 2, pairY + pairH + 26 * PX + i * 12 * PX)
  })
  wrapCanvas(ctx, LLUVIA.step3.correctCaption, pairW - 8 * PX).forEach((line, i) => {
    ctx.fillText(line, rightX + pairW / 2, pairY + pairH + 26 * PX + i * 12 * PX)
  })
  ctx.textAlign = 'left'
  drawHairline(ctx, tops[3])

  drawSimpleStep(4, LLUVIA.step4.title, modules, tops[3], heights[3], true, false)

  return canvas.toBuffer('image/png')
}

async function generateCuadroPng(): Promise<Buffer> {
  const [hall, cabinets, panel] = await Promise.all([
    loadImage(join(ASSETS, 'hall.png')),
    loadImage(join(ASSETS, 'cabinets.png')),
    loadImage(join(ASSETS, 'panel.png')),
  ])
  const photos = [hall, cabinets, panel]
  const canvas = createCanvas(PAGE_W, PAGE_H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = rgbCss(DS_RGB.white)
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  ctx.fillStyle = rgbCss(DS_RGB.grayDark)
  ctx.font = `bold ${16 * PX}px DSSans`
  ctx.textAlign = 'center'
  const titleLines = wrapCanvas(ctx, CUADRO.title, PAGE_W - MX * 2)
  titleLines.forEach((line, i) => {
    ctx.fillText(line, PAGE_W / 2, MY + 20 * PX + i * 20 * PX)
  })
  ctx.textAlign = 'left'
  const titleH = 48 * PX
  drawHairline(ctx, MY + titleH)

  const circle = 28 * PX
  const bodyTop = MY + titleH + DS_SPACE.sm * PX
  const bodyH = PAGE_H - MY - bodyTop
  const stepH = bodyH / 3
  const photoW = (PAGE_W - MX * 2) * 0.52
  const textW = PAGE_W - MX * 2 - photoW - DS_SPACE.md * PX - circle - DS_SPACE.sm * PX

  CUADRO.steps.forEach((step, i) => {
    const y0 = bodyTop + i * stepH
    const mid = y0 + stepH / 2
    drawNumber(ctx, step.n, MX, mid - circle / 2, circle)
    ctx.fillStyle = rgbCss(DS_RGB.grayDark)
    ctx.font = `bold ${13 * PX}px DSSans`
    const lines = wrapCanvas(ctx, step.text, textW)
    const lineH = 18 * PX
    const tx = MX + circle + DS_SPACE.sm * PX
    const ty = mid - ((lines.length - 1) * lineH) / 2
    lines.forEach((line, li) => {
      ctx.fillText(line, tx, ty + li * lineH)
    })
    const imgH = stepH - DS_SPACE.lg * PX
    drawCoverImage(
      ctx,
      photos[i],
      PAGE_W - MX - photoW,
      y0 + (stepH - imgH) / 2,
      photoW,
      imgH,
      true,
    )
    if (i < CUADRO.steps.length - 1) drawHairline(ctx, y0 + stepH)
  })

  return canvas.toBuffer('image/png')
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(ASSETS, { recursive: true })
  registerManualFonts()
  await extractPhotos()

  writeFileSync(join(OUT, 'check-list.pdf'), generateCheckListPdf())
  writeFileSync(join(OUT, 'horno-limpieza.pdf'), generateHornoPdf())
  writeFileSync(join(OUT, 'cambios-lluvia.png'), await generateCambiosLluviaPng())
  writeFileSync(join(OUT, 'cuadro-electrico.png'), await generateCuadroPng())

  console.log('OK → public/docs/manuals/{check-list.pdf,horno-limpieza.pdf,cambios-lluvia.png,cuadro-electrico.png}')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
