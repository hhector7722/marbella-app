import { createDsDocument, drawBlockTitle, DS_COMPANY, DS_RGB, DS_SPACE, DS_TYPE } from './design-system-v2/index.ts';
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

function slugName(row: EmploymentIntakeRow): string {
  const raw = fullName(row)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return raw || 'trabajador';
}

function drawField(
  doc: ReturnType<typeof createDsDocument>['doc'],
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
): number {
  doc.setFont(DS_TYPE.fontFamily, 'normal');
  doc.setFontSize(DS_TYPE.caption);
  doc.setTextColor(...DS_RGB.grayMid);
  doc.text(label, x, y);

  doc.setFont(DS_TYPE.fontFamily, 'normal');
  doc.setFontSize(DS_TYPE.body);
  doc.setTextColor(...DS_RGB.grayDark);
  const lines = doc.splitTextToSize(value || ' ', w);
  doc.text(lines, x, y + 12);
  return y + 12 + lines.length * 12 + DS_SPACE.xs;
}

export function buildAltaLaboralPdf(input: AltaLaboralPdfInput): {
  bytes: Uint8Array;
  filename: string;
} {
  if (!canGenerateAltaPdf(input.row)) {
    const missing = missingAltaPdfFields(input.row)
      .map((f) => f.label)
      .join(', ');
    throw new Error(`Faltan datos para el PDF: ${missing}`);
  }

  const { row } = input;
  const ds = createDsDocument({
    documentTitle: 'Alta Laboral',
    footerLabel: DS_COMPANY.tradeName,
    footerSubline: `${DS_COMPANY.legalName} · ${DS_COMPANY.cif} · ${DS_COMPANY.address}`,
  });
  const { doc, geom } = ds;
  let y = ds.cursorY;

  doc.setFont(DS_TYPE.fontFamily, 'normal');
  doc.setFontSize(DS_TYPE.body);
  doc.setTextColor(...DS_RGB.grayMid);
  doc.text(`${DS_COMPANY.legalName} · ${DS_COMPANY.address}`, geom.contentLeft, y);
  y += DS_SPACE.md;

  y = drawBlockTitle(doc, 'Datos del trabajador', geom.contentLeft, y);

  const colW = (geom.contentW - DS_SPACE.md) / 2;
  const left = geom.contentLeft;
  const right = geom.contentLeft + colW + DS_SPACE.md;

  let yL = drawField(doc, 'Nombre completo', fullName(row), left, y, colW);
  let yR = drawField(doc, 'NIF / NIE / Pasaporte', row.dni ?? '', right, y, colW);
  y = Math.max(yL, yR);

  yL = drawField(doc, 'Nº de afiliación a la S.S.', row.afiliacion_seguridad_social ?? '', left, y, colW);
  yR = drawField(doc, 'Nacionalidad', row.nacionalidad ?? '', right, y, colW);
  y = Math.max(yL, yR);

  yL = drawField(doc, 'Fecha de nacimiento', formatCivilDateEs(row.fecha_nacimiento), left, y, colW);
  yR = drawField(doc, 'Teléfono', row.phone ?? '', right, y, colW);
  y = Math.max(yL, yR);

  yL = drawField(doc, 'Correo electrónico', row.email ?? '', left, y, colW);
  yR = drawField(doc, 'IBAN', row.bank_account ?? '', right, y, colW);
  y = Math.max(yL, yR);

  y = drawField(doc, 'Domicilio completo', row.domicilio ?? '', left, y, geom.contentW);
  y += DS_SPACE.sm;

  y = drawBlockTitle(doc, 'Datos del contrato', left, y);

  yL = drawField(doc, 'Categoría', row.categoria ?? '', left, y, colW);
  yR = drawField(doc, 'Tipo de contrato', row.tipo_contrato ?? '', right, y, colW);
  y = Math.max(yL, yR);

  yL = drawField(doc, 'Horas semanales', String(row.weekly_hours ?? ''), left, y, colW);
  yR = drawField(doc, 'Fecha de inicio', formatCivilDateEs(row.fecha_inicio), right, y, colW);
  y = Math.max(yL, yR);

  y = drawField(
    doc,
    'Fecha de finalización',
    row.fecha_fin ? formatCivilDateEs(row.fecha_fin) : 'Indefinido',
    left,
    y,
    colW,
  );
  y += DS_SPACE.md;

  const imgW = (geom.contentW - DS_SPACE.md) / 2;
  const imgH = 110;
  if (y + imgH > geom.contentBottom) {
    y = ds.addPage();
  }

  const drawDocImage = (image: AltaPdfImage | null, x: number, caption: string) => {
    if (image) {
      try {
        doc.addImage(image.dataUrl, image.format, x, y, imgW, imgH);
      } catch {
        doc.setDrawColor(...DS_RGB.grayLight);
        doc.roundedRect(x, y, imgW, imgH, 4, 4, 'S');
      }
    } else {
      doc.setDrawColor(...DS_RGB.grayLight);
      doc.roundedRect(x, y, imgW, imgH, 4, 4, 'S');
    }
    doc.setFont(DS_TYPE.fontFamily, 'normal');
    doc.setFontSize(DS_TYPE.caption);
    doc.setTextColor(...DS_RGB.grayMid);
    doc.text(caption, x + imgW / 2, y + imgH + 12, { align: 'center' });
  };

  drawDocImage(input.frontImage, left, 'Documento de identidad (anverso)');
  drawDocImage(input.backImage, right, 'Documento de identidad (reverso)');

  ds.paintChromeAll();

  const bytes = doc.output('arraybuffer');
  return {
    bytes: new Uint8Array(bytes),
    filename: `alta-laboral-${slugName(row)}.pdf`,
  };
}
