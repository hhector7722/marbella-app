/**
 * Genera PDF imprimible: 52 vales de bebida (2 por persona × 26).
 * 3 columnas, formato rectangular, logo oscuro (imprimible en blanco).
 * Uso: node scripts/generate-drink-vouchers-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'docs/propuestas/vales-bebida-cena-monitores.pdf');
const logoSrc = join(root, 'public/icons/logo-white.png');

const INK = [36, 63, 72]; // petróleo deep
const MUTED = [90, 90, 90];
const LINE = [170, 170, 170];

const PERSONAS = 26;
const VALES_POR_PERSONA = 2;
const TOTAL = PERSONAS * VALES_POR_PERSONA; // 52

/** 3 columnas → vales más anchos (rectangulares) */
const COLS = 3;
const ROWS = 6;
const PER_PAGE = COLS * ROWS; // 18

const pageW = 210;
const pageH = 297;
const marginX = 7;
const marginY = 8;
const gapX = 3;
const gapY = 3;

const ticketW = (pageW - marginX * 2 - gapX * (COLS - 1)) / COLS;
const ticketH = (pageH - marginY * 2 - gapY * (ROWS - 1)) / ROWS;

/** Logo blanco+alpha → tinta oscura para imprimir sobre papel blanco. */
async function loadPrintLogoDataUrl() {
  const { data, info } = await sharp(logoSrc)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    // Blanco del logo → petróleo; alpha se conserva
    out[i] = INK[0];
    out[i + 1] = INK[1];
    out[i + 2] = INK[2];
    out[i + 3] = a;
  }

  const png = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
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
  doc.roundedRect(x, y, ticketW, ticketH, 1.5, 1.5, 'D');

  const pad = 2.5;
  const logoH = Math.min(ticketH - pad * 2, 14);
  const logoW = logoH * (595 / 613);
  const logoX = x + pad;
  const logoY = y + (ticketH - logoH) / 2;

  try {
    doc.addImage(logo, 'PNG', logoX, logoY, logoW, logoH);
  } catch {
    /* sin logo */
  }

  const textLeft = logoX + logoW + 2.5;
  const textW = x + ticketW - pad - textLeft;
  const cx = textLeft + textW / 2;
  const cy = y + ticketH / 2;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VALE · 1 BEBIDA', cx, cy - 2.5, { align: 'center', maxWidth: textW });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text('Bar La Marbella', cx, cy + 1.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  const num = String(n).padStart(2, '0');
  doc.text(`Nº ${num}/${TOTAL}`, cx, cy + 6, { align: 'center' });
}

const logo = await loadPrintLogoDataUrl();
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
writeFileSync(outPath, buf);
console.log(`OK ${TOTAL} vales (${VALES_POR_PERSONA}×${PERSONAS} pers.) → ${outPath}`);
console.log(`Páginas: ${pages} · ${COLS}×${ROWS}=${PER_PAGE} vales/hoja`);
console.log('Descarga: /api/propuestas/vales-bebida (solo email autorizado)');
