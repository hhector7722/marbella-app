/**
 * Genera PDF imprimible: 52 vales de bebida (2 por persona × 26).
 * 3 columnas, vales bajos (más filas), logo original visible.
 * Uso: node scripts/generate-drink-vouchers-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'assets/propuestas/vales-bebida-cena-monitores.pdf');
const publicOut = join(root, 'public/propuestas/vales-bebida-cena-monitores.pdf');
const logoSrc = join(root, 'public/icons/logo-white.png');

const INK = [36, 63, 72];
const MUTED = [90, 90, 90];
const LINE = [170, 170, 170];

const PERSONAS = 26;
const VALES_POR_PERSONA = 2;
const TOTAL = PERSONAS * VALES_POR_PERSONA; // 52

/** Más filas → cada vale más bajo */
const COLS = 3;
const ROWS = 8;
const PER_PAGE = COLS * ROWS; // 24

const pageW = 210;
const pageH = 297;
const marginX = 7;
const marginY = 7;
const gapX = 2.5;
const gapY = 2;

const ticketW = (pageW - marginX * 2 - gapX * (COLS - 1)) / COLS;
const ticketH = (pageH - marginY * 2 - gapY * (ROWS - 1)) / ROWS;

/**
 * Logo: quita fondo negro, mantiene colores, PNG limpio para jsPDF.
 */
async function loadLogoDataUrl() {
  const { data, info } = await sharp(logoSrc)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    // Fondo negro / casi negro → transparente
    const isBlack = r < 28 && g < 28 && b < 28;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = isBlack ? 0 : a;
  }

  const png = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(140, 140, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString('base64')}`;
}

function drawCutGuides(doc) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.12);
  doc.setLineDashPattern([0.8, 0.8], 0);

  for (let c = 1; c < COLS; c++) {
    const x = marginX + c * ticketW + (c - 0.5) * gapX;
    doc.line(x, marginY - 1.5, x, pageH - marginY + 1.5);
  }
  for (let r = 1; r < ROWS; r++) {
    const y = marginY + r * ticketH + (r - 0.5) * gapY;
    doc.line(marginX - 1.5, y, pageW - marginX + 1.5, y);
  }
  doc.setLineDashPattern([], 0);
}

function drawTicket(doc, x, y, n, logo) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, ticketW, ticketH, 1.2, 1.2, 'D');

  const pad = 2;
  const logoH = Math.min(ticketH - pad * 2, 11);
  const logoW = logoH;
  const logoX = x + pad;
  const logoY = y + (ticketH - logoH) / 2;

  try {
    doc.addImage(logo, 'PNG', logoX, logoY, logoW, logoH, undefined, 'FAST');
  } catch (err) {
    console.warn('logo addImage falló:', err?.message ?? err);
  }

  const textLeft = logoX + logoW + 2;
  const textW = x + ticketW - pad - textLeft;
  const cx = textLeft + textW / 2;
  const cy = y + ticketH / 2;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VALE · 1 BEBIDA', cx, cy - 2.2, { align: 'center', maxWidth: textW });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...MUTED);
  doc.text('Bar La Marbella', cx, cy + 1.2, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...INK);
  const num = String(n).padStart(2, '0');
  doc.text(`Nº ${num}/${TOTAL}`, cx, cy + 5.2, { align: 'center' });
}

const logo = await loadLogoDataUrl();
const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const pages = Math.ceil(TOTAL / PER_PAGE);

console.log(
  `ticket ${ticketW.toFixed(1)}×${ticketH.toFixed(1)} mm (W/H=${(ticketW / ticketH).toFixed(2)})`
);

for (let page = 0; page < pages; page++) {
  if (page > 0) doc.addPage();
  drawCutGuides(doc);

  for (let i = 0; i < PER_PAGE; i++) {
    const n = page * PER_PAGE + i + 1;
    if (n > TOTAL) break;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = marginX + col * (ticketW + gapX);
    const y = marginY + row * (ticketH + gapY);
    drawTicket(doc, x, y, n, logo);
  }
}

const buf = Buffer.from(doc.output('arraybuffer'));
mkdirSync(dirname(outPath), { recursive: true });
mkdirSync(dirname(publicOut), { recursive: true });
writeFileSync(outPath, buf);
writeFileSync(publicOut, buf);
console.log(`OK ${TOTAL} vales (${VALES_POR_PERSONA}×${PERSONAS} pers.) → ${outPath}`);
console.log(`Páginas: ${pages} · ${COLS}×${ROWS}=${PER_PAGE} vales/hoja`);
console.log('Descarga: /api/propuestas/vales-bebida (solo email autorizado)');
