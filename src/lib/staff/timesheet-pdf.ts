/**
 * Generador de PDF oficial de jornada para Inspección de Trabajo.
 *
 * Orientación: A4 landscape (297 × 210 mm)
 * Paleta: institucional monocromática, apta para impresión en blanco y negro.
 * Sin decoraciones, sin colores llamativos. Máxima legibilidad.
 *
 * Dependencias: jspdf ^4, jspdf-autotable ^5
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimesheetExportPayload } from './timesheet-export-payload';

// ---------------------------------------------------------------------------
// Constantes de diseño
// ---------------------------------------------------------------------------

/** Ancho A4 landscape en mm */
const PAGE_W = 297;
/** Alto A4 landscape en mm */
const PAGE_H = 210;

const MARGIN = 18; // mm — margen lateral uniforme

/** Azul marino oscuro institucional */
const HEADER_BG: [number, number, number] = [26, 43, 60];   // #1A2B3C
const HEADER_TEXT: [number, number, number] = [255, 255, 255];

const TABLE_HEADER_BG: [number, number, number] = [26, 43, 60];
const TABLE_HEADER_TEXT: [number, number, number] = [255, 255, 255];

const ROW_ALT_BG: [number, number, number] = [248, 249, 250]; // #F8F9FA
const ROW_PLAIN_BG: [number, number, number] = [255, 255, 255];

const LINE_COLOR: [number, number, number] = [218, 221, 225]; // #DADDE1
const BODY_TEXT: [number, number, number] = [17, 17, 17];
const DIM_TEXT: [number, number, number] = [136, 136, 136];

// ---------------------------------------------------------------------------
// Helpers de formato (solo en este módulo)
// ---------------------------------------------------------------------------

function fmtDate(isoDate: string): string {
    // "2025-06-03" → "03/06/2025"
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

function fmtDateShort(isoDate: string): string {
    // "2025-06-03" → "03/06"
    const [, m, d] = isoDate.split('-');
    return `${d}/${m}`;
}

/** Nombre largo del día de la semana en español */
const WEEKDAY_NAMES_ES = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles',
    'Jueves', 'Viernes', 'Sábado',
];

function fmtMinutes(minutes: number): string {
    if (minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
}

function fmtMonthYear(year: number, month0indexed: number): string {
    const date = new Date(year, month0indexed, 1);
    const raw = format(date, 'MMMM yyyy', { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Genera el Export ID legible */
function buildExportId(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `EXP-${y}${mo}${d}-${h}${mi}${s}`;
}

/**
 * Carga una imagen desde una URL y la convierte a dataURL (PNG).
 * Necesario para jsPDF.addImage().
 */
function loadImageAsDataUrl(url: string): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// ---------------------------------------------------------------------------
// Sección: Cabecera del documento
// ---------------------------------------------------------------------------

/**
 * Dibuja la banda de cabecera y devuelve la coordenada Y donde termina.
 */
async function drawDocumentHeader(
    doc: jsPDF,
    payload: TimesheetExportPayload,
    logoDataUrl: string | null,
): Promise<number> {
    const BAND_H = 36; // mm de alto para la banda superior

    // Fondo de banda
    doc.setFillColor(...HEADER_BG);
    doc.rect(0, 0, PAGE_W, BAND_H, 'F');

    let logoEndX = MARGIN;

    // Logo (opcional — si carga correctamente)
    if (logoDataUrl) {
        const LOGO_H = 18;
        const LOGO_W = 18;
        const LOGO_Y = (BAND_H - LOGO_H) / 2;
        doc.addImage(logoDataUrl, 'PNG', MARGIN, LOGO_Y, LOGO_W, LOGO_H);
        logoEndX = MARGIN + LOGO_W + 5;
    }

    // ---- Bloque izquierdo: empresa y empleado ----
    const leftX = logoEndX;
    const midBand = BAND_H / 2;

    doc.setTextColor(...HEADER_TEXT);

    // Nombre empresa — negrita grande
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(payload.companyName.toUpperCase(), leftX, midBand - 5);

    // Título del documento
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(200, 210, 220); // blanco suavizado
    doc.text('INFORME OFICIAL DE JORNADA LABORAL', leftX, midBand + 1);

    // Separador fino
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(leftX, midBand + 4, leftX + 90, midBand + 4);
    doc.setLineDashPattern([], 0);

    // Empleado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...HEADER_TEXT);
    const employeeLabel = `Empleado: ${payload.employeeFullName}`;
    doc.text(employeeLabel, leftX, midBand + 9);

    // DNI (solo si existe)
    if (payload.employeeDni) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(200, 210, 220);
        doc.text(`DNI: ${payload.employeeDni}`, leftX, midBand + 14.5);
    }

    // ---- Bloque derecho: período y generación ----
    const rightX = PAGE_W - MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...HEADER_TEXT);
    doc.text(fmtMonthYear(payload.periodYear, payload.periodMonth), rightX, midBand - 4, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(200, 210, 220);
    const generatedLabel = `Generado: ${fmtDate(payload.generatedAt.toISOString().slice(0, 10))} ${String(payload.generatedAt.getHours()).padStart(2, '0')}:${String(payload.generatedAt.getMinutes()).padStart(2, '0')} h`;
    doc.text(generatedLabel, rightX, midBand + 3, { align: 'right' });

    return BAND_H;
}

// ---------------------------------------------------------------------------
// Sección: Bloque de resumen
// ---------------------------------------------------------------------------

/**
 * Dibuja el bloque resumen del período.
 * Devuelve la Y donde termina.
 */
function drawSummaryBlock(doc: jsPDF, payload: TimesheetExportPayload, startY: number): number {
    const BOX_Y = startY + 6;
    const BOX_H = 18;
    const BOX_W = PAGE_W - MARGIN * 2;

    // Marco exterior muy sutil
    doc.setDrawColor(...LINE_COLOR);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, BOX_Y, BOX_W, BOX_H, 1.5, 1.5, 'D');

    // Encabezado de sección
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(100, 110, 120);
    doc.text('RESUMEN DEL PERÍODO', MARGIN + 4, BOX_Y + 4.5);

    // Separador horizontal interno bajo el label
    doc.setDrawColor(...LINE_COLOR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN + 1, BOX_Y + 6, MARGIN + BOX_W - 1, BOX_Y + 6);

    // 4 métricas en 2 columnas × 2 filas
    const col1X = MARGIN + 4;
    const col2X = MARGIN + BOX_W / 2 + 4;
    const row1Y = BOX_Y + 10.5;
    const row2Y = BOX_Y + 15.5;

    const items: [string, string][] = [
        ['Jornadas trabajadas', String(payload.totalDays)],
        ['Total horas trabajadas', fmtMinutes(payload.totalWorkedMinutes)],
        ['Primera jornada', payload.firstDayDate ? fmtDateShort(payload.firstDayDate) : '—'],
        ['Última jornada', payload.lastDayDate ? fmtDateShort(payload.lastDayDate) : '—'],
    ];

    const positions: [number, number][] = [
        [col1X, row1Y],
        [col2X, row1Y],
        [col1X, row2Y],
        [col2X, row2Y],
    ];

    items.forEach(([label, value], i) => {
        const [x, y] = positions[i];

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(130, 140, 150);
        doc.text(label.toUpperCase(), x, y - 2.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...BODY_TEXT);
        doc.text(value, x, y);
    });

    // Separador vertical entre columnas
    const sepX = MARGIN + BOX_W / 2;
    doc.setDrawColor(...LINE_COLOR);
    doc.setLineWidth(0.2);
    doc.line(sepX, BOX_Y + 6.5, sepX, BOX_Y + BOX_H - 1);

    return BOX_Y + BOX_H;
}

// ---------------------------------------------------------------------------
// Sección: Tabla principal
// ---------------------------------------------------------------------------

function drawTable(doc: jsPDF, payload: TimesheetExportPayload, startY: number): number {
    const tableY = startY + 6;

    const head = [['FECHA', 'DÍA', 'ENTRADA', 'SALIDA', 'HORAS TRABAJADAS']];

    const body = payload.rows.map((row, idx) => [
        fmtDate(row.date),
        WEEKDAY_NAMES_ES[row.weekday] ?? '',
        row.clockIn ?? '—',
        row.clockOut ?? '—',
        fmtMinutes(row.workedMinutes),
    ]);

    autoTable(doc, {
        startY: tableY,
        head,
        body,
        theme: 'plain',

        headStyles: {
            fillColor: TABLE_HEADER_BG,
            textColor: TABLE_HEADER_TEXT,
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
            minCellHeight: 8,
        },

        bodyStyles: {
            fontSize: 8.5,
            textColor: BODY_TEXT,
            cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
            valign: 'middle',
            minCellHeight: 7,
        },

        columnStyles: {
            0: { halign: 'center', cellWidth: 28 },   // Fecha
            1: { halign: 'left', cellWidth: 38 },      // Día
            2: { halign: 'center', cellWidth: 30 },    // Entrada
            3: { halign: 'center', cellWidth: 30 },    // Salida
            4: { halign: 'center' },                    // Horas (resto)
        },

        alternateRowStyles: {
            fillColor: ROW_ALT_BG,
        },

        styles: {
            font: 'helvetica',
            lineColor: LINE_COLOR,
            lineWidth: 0.15,
        },

        margin: { left: MARGIN, right: MARGIN },

        // Dibujar línea separadora bajo cada fila del body
        didDrawCell: (data) => {
            if (data.section === 'body') {
                doc.setDrawColor(...LINE_COLOR);
                doc.setLineWidth(0.1);
                doc.line(
                    data.cell.x,
                    data.cell.y + data.cell.height,
                    data.cell.x + data.cell.width,
                    data.cell.y + data.cell.height,
                );
            }
        },
    });

    return (doc as any).lastAutoTable?.finalY ?? tableY;
}

// ---------------------------------------------------------------------------
// Sección: Pie de página
// ---------------------------------------------------------------------------

function drawFooter(doc: jsPDF, payload: TimesheetExportPayload, exportId: string): void {
    const footerY = PAGE_H - 8;

    doc.setDrawColor(...LINE_COLOR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, footerY - 3, PAGE_W - MARGIN, footerY - 3);

    const footerText = [
        `Documento generado automáticamente por Marbella OS`,
        `${fmtDate(payload.generatedAt.toISOString().slice(0, 10))} ${String(payload.generatedAt.getHours()).padStart(2, '0')}:${String(payload.generatedAt.getMinutes()).padStart(2, '0')} h`,
        exportId,
    ].join('  ·  ');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...DIM_TEXT);
    doc.text(footerText, PAGE_W / 2, footerY, { align: 'center' });
}

// ---------------------------------------------------------------------------
// Función principal exportada
// ---------------------------------------------------------------------------

/**
 * Genera y descarga el PDF oficial de jornada para Inspección de Trabajo.
 */
export async function generateTimesheetPdf(payload: TimesheetExportPayload): Promise<void> {
    const exportId = buildExportId(payload.generatedAt);

    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
    });

    // Pre-cargar logo
    const logoDataUrl = await loadImageAsDataUrl('/icons/logo-white.png');

    // 1. Cabecera
    const afterHeader = await drawDocumentHeader(doc, payload, logoDataUrl);

    // 2. Resumen
    const afterSummary = drawSummaryBlock(doc, payload, afterHeader);

    // 3. Tabla principal
    drawTable(doc, payload, afterSummary);

    // 4. Pie (siempre en la última página)
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(doc, payload, exportId);
    }

    // Nombre de archivo
    const monthLabel = format(
        new Date(payload.periodYear, payload.periodMonth, 1),
        'yyyy-MM',
    );
    const employeeSlug = payload.employeeFullName
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

    doc.save(`jornada_${employeeSlug}_${monthLabel}.pdf`);
}
