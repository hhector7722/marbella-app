/**
 * Genera PDF imprimible: 30 vales de bebida (cena monitores).
 * Uso: node scripts/generate-drink-vouchers-pdf.mjs
 */
import { jsPDF } from 'jspdf';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'docs/propuestas/vales-bebida-cena-monitores.pdf');
const publicOut = join(root, 'public/propuestas/vales-bebida-cena-monitores.pdf');

const PETROLEO = [54, 96, 111];
const PETROLEO_DEEP = [36, 63, 72];
const MUTED = [106, 120, 126];
const INK = [28, 36, 40];
const LINE = [200, 210, 214];

const TOTAL = 30;
const COLS = 2;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;

const pageW = 210;
const pageH = 297;
const marginX = 8;
const marginY = 10;
const gapX = 4;
const gapY = 4;

const ticketW = (pageW - marginX * 2 - gapX * (COLS - 1)) / COLS;
const ticketH = (pageH - marginY * 2 - gapY * (ROWS - 1)) / ROWS;

function loadLogoDataUrl() {
  const buf = readFileSync(join(root, 'public/icons/logo-white.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function drawCutGuides(doc) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([1.2, 1.2], 0);

  for (let c = 1; c < COLS; c++) {
    const x = marginX + c * ticketW + (c - 0.5) * gapX;
    doc.line(x, marginY - 2, x, pageH - marginY + 2);
  }
  for (let r = 1; r < ROWS; r++) {
    const y = marginY + r * ticketH + (r - 0.5) * gapY;
    doc.line(marginX - 2, y, pageW - marginX + 2, y);
  }
  doc.setLineDashPattern([], 0);
}

function drawTicket(doc, x, y, n, logo) {
  const r = 3.2;
  // Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, ticketW, ticketH, r, r, 'FD');

  // Header bar
  const headH = 14;
  doc.setFillColor(...PETROLEO_DEEP);
  doc.roundedRect(x, y, ticketW, headH + 2, r, r, 'F');
  doc.rect(x, y + headH - 1, ticketW, 3, 'F');

  // Logo
  const logoSize = 9;
  try {
    doc.addImage(logo, 'PNG', x + 4, y + 2.5, logoSize, logoSize);
  } catch {
    /* sin logo */
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BAR LA MARBELLA', x + 15, y + 6.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Cena monitores', x + 15, y + 10.5);

  // Body
  const bodyY = y + headH + 4;
  doc.setTextColor(...PETROLEO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('VALE · 1 BEBIDA', x + ticketW / 2, bodyY + 6, { align: 'center' });

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Canjeable en barra · una unidad', x + ticketW / 2, bodyY + 12.5, {
    align: 'center',
  });

  // Footer strip
  const footY = y + ticketH - 11;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(x + 4, footY, x + ticketW - 4, footY);

  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text('Entregar al personal', x + 5, footY + 5.5);

  doc.setTextColor(...PETROLEO_DEEP);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const num = String(n).padStart(2, '0');
  doc.text(`Nº ${num} / ${TOTAL}`, x + ticketW - 5, footY + 5.8, { align: 'right' });
}

const logo = loadLogoDataUrl();
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
    drawTicket(doc, x, y, n, logo);
  }
}

const buf = Buffer.from(doc.output('arraybuffer'));
mkdirSync(dirname(outPath), { recursive: true });
mkdirSync(dirname(publicOut), { recursive: true });
writeFileSync(outPath, buf);
writeFileSync(publicOut, buf);
console.log(`OK ${TOTAL} vales → ${outPath}`);
console.log(`OK copia pública → ${publicOut}`);
console.log(`Páginas: ${pages} (recortar por guías discontinuas)`);
