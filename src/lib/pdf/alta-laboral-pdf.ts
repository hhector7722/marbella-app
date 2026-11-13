import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import { canGenerateAltaPdf, missingAltaPdfFields } from '../alta-laboral/completeness.ts';
import { formatCivilDateEs, fullName } from '../alta-laboral/dates.ts';
import type { EmploymentIntakeRow } from '../alta-laboral/types.ts';

export type AltaPdfImage = {
  dataUrl: string;
  format: 'JPEG' | 'PNG' | 'WEBP';
};

export type AltaLaboralPdfInput = {
  row: EmploymentIntakeRow;
  frontImage: AltaPdfImage | null;
  backImage: AltaPdfImage | null;
};

// Plantilla aprobada el 01/09/2026 (variante Roboto con contrato).
// Se utiliza como fondo original del documento, sin volver a dibujar
// cabecera, logotipo, datos de empresa, títulos ni etiquetas.
const TEMPLATE_PATH = join(process.cwd(), 'src', 'lib', 'pdf', 'templates', 'alta-laboral-plantilla.pdf');
const PAGE_HEIGHT = 792; // Carta US: formato original de la plantilla aprobada.
const VALUE_X = 184;
const VALUE_MAX_WIDTH = 356;
const LABEL_BASELINES = {
  first_name: 173.1,
  dni: 198.7,
  afiliacion_seguridad_social: 224.3,
  nacionalidad: 249.9,
  fecha_nacimiento: 275.5,
  domicilio: 301.1,
  phone: 326.7,
  email: 352.3,
  bank_account: 377.9,
  categoria: 434.3,
  tipo_contrato: 459.9,
  weekly_hours: 485.5,
  fecha_inicio: 511.1,
  fecha_fin: 536.7,
} as const;

function slugName(row: EmploymentIntakeRow): string {
  const raw = fullName(row)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return raw || 'trabajador';
}

function supportedText(value: string, font: PDFFont): string {
  // WinAnsi es el juego de caracteres de la tipografía PDF estándar.
  // Se conserva cada carácter imprimible; los incompatibles se transliteran.
  return [...value].map((character) => {
    try {
      font.encodeText(character);
      return character;
    } catch {
      const reduced = character.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      try {
        font.encodeText(reduced);
        return reduced;
      } catch {
        throw new Error('El documento contiene caracteres que la plantilla PDF no puede representar fielmente.');
      }
    }
  }).join('');
}

function wrapWithinWidth(value: string, font: PDFFont, size: number): string[] {
  const lines: string[] = [''];
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const current = lines[lines.length - 1];
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= VALUE_MAX_WIDTH) {
      lines[lines.length - 1] = candidate;
      continue;
    }
    if (font.widthOfTextAtSize(word, size) > VALUE_MAX_WIDTH) {
      return [value]; // Campo sin espacios que necesita una talla inferior.
    }
    lines.push(word);
  }
  return lines;
}

function drawValue(
  page: PDFPage,
  font: PDFFont,
  value: string,
  baselineFromTop: number,
  field: string,
) {
  const clean = supportedText(value.trim(), font);
  if (!clean) return;
  for (const fontSize of [9.2, 8.7, 8.2, 7.7, 7.2, 6.8]) {
    const lines = wrapWithinWidth(clean, font, fontSize);
    if (lines.length > 2 || lines.some((line) => font.widthOfTextAtSize(line, fontSize) > VALUE_MAX_WIDTH)) continue;
    for (const [index, line] of lines.entries()) {
      page.drawText(line, {
        x: VALUE_X,
        y: PAGE_HEIGHT - baselineFromTop - index * 10,
        size: fontSize,
        font,
        color: rgb(0.08, 0.17, 0.30),
      });
    }
    return;
  }
  throw new Error(`El campo "${field}" es demasiado largo para la plantilla del PDF.`);
}

async function embedDocumentImage(pdf: PDFDocument, image: AltaPdfImage) {
  const base64 = image.dataUrl.split(',')[1];
  if (!base64) throw new Error('Imagen de identidad ilegible');
  const bytes = Buffer.from(base64, 'base64');
  if (image.format === 'PNG') return pdf.embedPng(bytes);
  if (image.format === 'JPEG') return pdf.embedJpg(bytes);
  // pdf-lib no soporta WebP; convertir sin alterar el original.
  const converted = await sharp(bytes).jpeg({ quality: 92 }).toBuffer();
  return pdf.embedJpg(converted);
}

async function paintDniCards(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  frontImage: AltaPdfImage,
  backImage: AltaPdfImage,
) {
  // Las tarjetas conservan las dos columnas de la plantilla. Se aumenta
  // su altura para que las fotografías completas del DNI sean legibles.
  const top = 564;
  const bottom = 725;
  const left = 70.7;
  const divider = 306;
  const right = 541.3;
  const border = rgb(0.60, 0.63, 0.66);
  page.drawRectangle({
    x: left - 1,
    y: PAGE_HEIGHT - bottom - 1,
    width: right - left + 2,
    height: bottom - top + 3,
    color: rgb(1, 1, 1),
    borderColor: border,
    borderWidth: 0.7,
  });
  page.drawLine({
    start: { x: divider, y: PAGE_HEIGHT - top },
    end: { x: divider, y: PAGE_HEIGHT - bottom },
    color: border,
    thickness: 0.7,
  });

  const addImage = async (image: AltaPdfImage, xLeft: number, xRight: number, label: string) => {
    const embedded = await embedDocumentImage(pdf, image);
    const frame = {
      x: xLeft + 12,
      y: PAGE_HEIGHT - 700,
      width: xRight - xLeft - 24,
      height: 124,
    };
    const scale = Math.min(frame.width / embedded.width, frame.height / embedded.height);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    page.drawImage(embedded, {
      x: frame.x + (frame.width - w) / 2,
      y: frame.y + (frame.height - h) / 2,
      width: w,
      height: h,
    });
    page.drawText(label, {
      x: (xLeft + xRight) / 2 - font.widthOfTextAtSize(label, 8.3) / 2,
      y: PAGE_HEIGHT - 714,
      size: 8.3,
      font,
      color: rgb(0.13, 0.20, 0.30),
    });
  };

  await addImage(frontImage, left, divider, 'Documento de identidad · Anverso');
  await addImage(backImage, divider, right, 'Documento de identidad · Reverso');
}

export async function buildAltaLaboralPdf(input: AltaLaboralPdfInput): Promise<{
  bytes: Uint8Array;
  filename: string;
}> {
  if (!canGenerateAltaPdf(input.row)) {
    throw new Error(`Faltan datos para el PDF: ${missingAltaPdfFields(input.row).map((f) => f.label).join(', ')}`);
  }
  if (!input.frontImage || !input.backImage) {
    throw new Error('No se pudieron recuperar las dos imágenes del documento de identidad.');
  }

  const pdf = await PDFDocument.load(readFileSync(TEMPLATE_PATH));
  const pages = pdf.getPages();
  if (pages.length !== 1 || pages[0].getWidth() !== 612 || pages[0].getHeight() !== PAGE_HEIGHT) {
    throw new Error('La plantilla del alta laboral no tiene el formato original esperado.');
  }
  const page = pages[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const row = input.row;

  const values: Record<keyof typeof LABEL_BASELINES, string> = {
    first_name: fullName(row),
    dni: row.dni ?? '',
    afiliacion_seguridad_social: row.afiliacion_seguridad_social ?? '',
    nacionalidad: row.nacionalidad ?? '',
    fecha_nacimiento: formatCivilDateEs(row.fecha_nacimiento),
    domicilio: row.domicilio ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    bank_account: row.bank_account ?? '',
    categoria: row.categoria ?? '',
    tipo_contrato: row.tipo_contrato ?? '',
    weekly_hours: String(row.weekly_hours ?? ''),
    fecha_inicio: formatCivilDateEs(row.fecha_inicio),
    fecha_fin: row.fecha_fin ? formatCivilDateEs(row.fecha_fin) : 'Indefinido',
  };

  for (const [field, baseline] of Object.entries(LABEL_BASELINES)) {
    drawValue(page, font, values[field as keyof typeof LABEL_BASELINES], baseline, field);
  }
  await paintDniCards(pdf, page, font, input.frontImage, input.backImage);

  return {
    bytes: await pdf.save(),
    filename: `alta-laboral-${slugName(row)}.pdf`,
  };
}
