/**
 * Genera PDF imprimible: 52 vales de bebida (2 por persona × 26).
 * Diseño mínimo (blanco, sin cabecera) para ahorrar tinta.
 * Uso: node scripts/generate-drink-vouchers-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'docs/propuestas/vales-bebida-cena-monitores.pdf');

const INK = [40, 40, 40];
const MUTED = [90, 90, 90];
const LINE = [180, 180, 180];

const PERSONAS = 26;
const VALES_POR_PERSONA = 2;
const TOTAL = PERSONAS * VALES_POR_PERSONA; // 52

/** Más vales por hoja A4 */
const COLS = 4;
const ROWS = 8;
const PER_PAGE = COLS * ROWS; // 32

const pageW = 210;
const pageH = 297;
const marginX = 6;
const marginY = 6;
const gapX = 2;
const gapY = 2;

const ticketW = (pageW - marginX * 2 - gapX * (COLS - 1)) / COLS;
const ticketH = (pageH - marginY * 2 - gapY * (ROWS - 1)) / ROWS;

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

function drawTicket(doc, x, y, n) {
  // Solo borde fino — sin relleno de color (ahorro de tinta)
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, ticketW, ticketH, 1.2, 1.2, 'D');

  const cx = x + ticketW / 2;
  const cy = y + ticketH / 2;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VALE · 1 BEBIDA', cx, cy - 2.2, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text('Bar La Marbella', cx, cy + 1.8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...INK);
  const num = String(n).padStart(2, '0');
  doc.text(`Nº ${num}/${TOTAL}`, cx, cy + 5.8, { align: 'center' });
}

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const pages = Math.ceil(TOTAL / PER_PAGE);

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
    drawTicket(doc, x, y, n);
  }
}

const buf = Buffer.from(doc.output('arraybuffer'));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buf);
console.log(`OK ${TOTAL} vales (${VALES_POR_PERSONA}×${PERSONAS} pers.) → ${outPath}`);
console.log(`Páginas: ${pages} · ${COLS}×${ROWS}=${PER_PAGE} vales/hoja`);
console.log('Descarga: /api/propuestas/vales-bebida (solo email autorizado)');
