/**
 * Generador de PDF oficial de jornada laboral — Inspección de Trabajo.
 *
 * Diseño: minimalista, corporativo, apto para auditorías e inspecciones.
 * Inspiración: Factorial, Sesame HR, Personio, Holded.
 *
 * Paleta: únicamente blanco, negro y grises muy suaves.
 * Sin bloques de color, sin degradados, sin sombras.
 * Legible impreso en blanco y negro.
 *
 * Orientación: A4 portrait (210 × 297 mm)
 * Dependencias: jspdf ^4, jspdf-autotable ^5
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimesheetExportPayload } from './timesheet-export-payload';

// ---------------------------------------------------------------------------
// Datos de empresa (fuente única — mismo origen que pdf-generator.ts)
// ---------------------------------------------------------------------------

const COMPANY = {
    tradeName: 'Bar La Marbella',
    legalName: 'Fogo Torrat S.L.',
    cif: 'B-09761628',
    address: 'Av. Litoral 86, 08005 Barcelona',
    workCenter: 'Bar La Marbella — Barcelona',
} as const;

// ---------------------------------------------------------------------------
// Sistema de diseño
// ---------------------------------------------------------------------------

const DS = {
    // Página (A4 portrait)
    pageW: 210,
    pageH: 297,
    marginH: 18,   // margen horizontal
    marginV: 14,   // margen vertical superior
    contentW: 174, // 210 - 2 * 18

    // Paleta
    black:    [15,  15,  15]  as [number, number, number],
    gray700:  [80,  80,  80]  as [number, number, number],
    gray500:  [130, 130, 130] as [number, number, number],
    gray300:  [200, 200, 200] as [number, number, number],
    gray100:  [234, 234, 234] as [number, number, number],  // #EAEAEA
    gray050:  [245, 245, 245] as [number, number, number],  // #F5F5F5
    white:    [255, 255, 255] as [number, number, number],

    // Tipografía
    font: 'helvetica' as const,
} as const;

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

/** "2026-07-10" → "10/07/2026" */
function isoToDisplay(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

/** "2026-07-10" → "10/07" */
function isoToShort(isoDate: string): string {
    const [, m, d] = isoDate.split('-');
    return `${d}/${m}`;
}

/** Minutos → "08 h 00 min" — vacío si es 0 */
function fmtMinutes(minutes: number): string {
    if (minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min`;
}

/** Total de minutos → "Xh Ymin" compacto para el resumen */
function fmtMinutesCompact(minutes: number): string {
    if (minutes <= 0) return '0 h';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Mes y año largo: "Julio 2026" */
function fmtMonthYear(year: number, month0: number): string {
    const d = new Date(year, month0, 1);
    const raw = format(d, 'MMMM yyyy', { locale: es });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** "EXP-20260710-082105" */
function buildExportId(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `EXP-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Carga imagen como dataURL para jsPDF */
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

/** Dibuja una línea horizontal fina gris */
function hLine(doc: jsPDF, y: number, x1 = DS.marginH, x2 = DS.pageW - DS.marginH) {
    doc.setDrawColor(...DS.gray300);
    doc.setLineWidth(0.2);
    doc.line(x1, y, x2, y);
}

// ---------------------------------------------------------------------------
// Sección: Cabecera del documento
// ---------------------------------------------------------------------------

/**
 * Dibuja la cabecera sobre fondo blanco.
 * Devuelve la Y donde acaba la cabecera.
 */
async function drawHeader(
    doc: jsPDF,
    payload: TimesheetExportPayload,
    logoDataUrl: string | null,
): Promise<number> {
    const L = DS.marginH;
    const R = DS.pageW - DS.marginH;
    let y = DS.marginV;

    // ── COLUMNA IZQUIERDA: logotipo + empresa ─────────────────────────────

    // Logo pequeño (si disponible) — negro sobre blanco no sirve, lo cargamos
    // pero lo renderizamos sobre blanco con un borde gris sutil
    const LOGO_SIZE = 9;

    if (logoDataUrl) {
        // Pequeño recuadro con fondo gris muy suave para que el logo blanco sea visible
        doc.setFillColor(...DS.gray050);
        doc.roundedRect(L, y, LOGO_SIZE, LOGO_SIZE, 1, 1, 'F');
        doc.addImage(logoDataUrl, 'PNG', L, y, LOGO_SIZE, LOGO_SIZE);
    }

    const textX = logoDataUrl ? L + LOGO_SIZE + 3.5 : L;
    let textY = y + 3;

    // Nombre comercial
    doc.setFont(DS.font, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DS.black);
    doc.text(COMPANY.tradeName, textX, textY);

    // Razón social
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...DS.gray700);
    doc.text(COMPANY.legalName, textX, textY + 4.5);

    // CIF
    doc.setFontSize(7);
    doc.setTextColor(...DS.gray500);
    doc.text(`CIF: ${COMPANY.cif}`, textX, textY + 8.5);

    // Dirección
    doc.text(COMPANY.address, textX, textY + 12);

    // ── COLUMNA DERECHA: período y generación ─────────────────────────────

    // Mes y año — prominente
    doc.setFont(DS.font, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...DS.black);
    doc.text(fmtMonthYear(payload.periodYear, payload.periodMonth), R, y + 5, { align: 'right' });

    // "Generado:"
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...DS.gray500);
    doc.text('Generado:', R, y + 11, { align: 'right' });

    const genDate = isoToDisplay(payload.generatedAt.toISOString().slice(0, 10));
    const genTime = `${String(payload.generatedAt.getHours()).padStart(2, '0')}:${String(payload.generatedAt.getMinutes()).padStart(2, '0')}`;
    doc.setFontSize(7.5);
    doc.setTextColor(...DS.gray700);
    doc.text(`${genDate}  ${genTime} h`, R, y + 15, { align: 'right' });

    // ── TÍTULO DEL DOCUMENTO ──────────────────────────────────────────────

    const titleY = y + 23;

    doc.setFont(DS.font, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DS.black);
    doc.text('INFORME DE REGISTRO DE JORNADA LABORAL', L, titleY);

    // Línea fina bajo el título
    hLine(doc, titleY + 2.5, L, R);

    // ── DATOS DEL EMPLEADO ────────────────────────────────────────────────

    const empY = titleY + 7;
    const labelW = 22;
    const col1 = L;
    const col2 = L + 90;

    // Fila 1
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...DS.gray500);
    doc.text('Empleado:', col1, empY);
    doc.setFont(DS.font, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...DS.black);
    doc.text(payload.employeeFullName, col1 + labelW, empY);

    // DNI (solo si existe)
    if (payload.employeeDni) {
        doc.setFont(DS.font, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...DS.gray500);
        doc.text('DNI / NIE:', col2, empY);
        doc.setFont(DS.font, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...DS.black);
        doc.text(payload.employeeDni, col2 + labelW, empY);
    }

    // Fila 2
    const empY2 = empY + 5;
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...DS.gray500);
    doc.text('Centro de trabajo:', col1, empY2);
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...DS.gray700);
    doc.text(COMPANY.workCenter, col1 + labelW, empY2);

    return empY2 + 5; // Y final de la cabecera
}

// ---------------------------------------------------------------------------
// Sección: Resumen (2 tarjetas horizontales — sin primera/última jornada)
// ---------------------------------------------------------------------------

function drawSummaryCompact(doc: jsPDF, payload: TimesheetExportPayload, startY: number): number {
    const GAP = 4;
    const CARD_W = (DS.contentW - GAP) / 2;
    const CARD_H = 16;
    const RADIUS = 1;

    const items: [string, string][] = [
        ['Jornadas trabajadas', String(payload.totalDays)],
        ['Total horas', fmtMinutesCompact(payload.totalWorkedMinutes)],
    ];

    items.forEach(([label, value], i) => {
        const x = DS.marginH + i * (CARD_W + GAP);
        const y = startY;

        doc.setFont(DS.font, 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...DS.gray500);
        doc.text(label.toUpperCase(), x, y + 5);

        doc.setFont(DS.font, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...DS.black);
        doc.text(value, x, y + 14);
    });

    return startY + 22;
}

// ---------------------------------------------------------------------------
// Sección: Resumen (4 tarjetas horizontales)
// ---------------------------------------------------------------------------

function drawSummary(doc: jsPDF, payload: TimesheetExportPayload, startY: number): number {
    const GAP = 4;
    const CARD_W = (DS.contentW - GAP * 3) / 4;
    const CARD_H = 16;
    const RADIUS = 1;

    const items: [string, string][] = [
        ['Jornadas trabajadas', String(payload.totalDays)],
        ['Total horas', fmtMinutesCompact(payload.totalWorkedMinutes)],
        ['Primera jornada', payload.firstDayDate ? isoToShort(payload.firstDayDate) : '—'],
        ['Última jornada',  payload.lastDayDate  ? isoToShort(payload.lastDayDate)  : '—'],
    ];

    items.forEach(([label, value], i) => {
        const x = DS.marginH + i * (CARD_W + GAP);
        const y = startY;

        // Marco del recuadro
        doc.setFillColor(...DS.white);
        doc.setDrawColor(...DS.gray100);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, CARD_W, CARD_H, RADIUS, RADIUS, 'FD');

        // Etiqueta superior
        doc.setFont(DS.font, 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...DS.gray500);
        doc.text(label.toUpperCase(), x + 4, y + 5);

        // Valor central
        doc.setFont(DS.font, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...DS.black);
        doc.text(value, x + 4, y + 12.5);
    });

    return startY + CARD_H;
}

// ---------------------------------------------------------------------------
// Sección: Tabla principal
// ---------------------------------------------------------------------------

const WEEKDAY_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function estadoLabel(eventType: string): string {
    return eventType === 'adjustment' ? 'Baja' : 'Regular';
}

function drawTable(doc: jsPDF, payload: TimesheetExportPayload, startY: number): number {
    const head = [['Fecha', 'Día', 'Estado', 'Entrada', 'Salida', 'Horas computadas']];

    const body = payload.rows.map((row) => [
        isoToDisplay(row.date),
        WEEKDAY_ES[row.weekday] ?? '',
        estadoLabel(row.eventType),
        row.eventType === 'adjustment' ? '' : (row.clockIn ?? ''),
        row.eventType === 'adjustment' ? '' : (row.clockOut ?? ''),
        fmtMinutes(row.displayMinutes),
    ]);

    autoTable(doc, {
        startY: startY + 5,
        head,
        body,
        theme: 'plain',

        headStyles: {
            fillColor: DS.white,
            textColor: DS.gray700,
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'left',
            valign: 'middle',
            cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
            minCellHeight: 8,
            lineWidth: { bottom: 0.3 },
            lineColor: DS.gray300,
        },

        bodyStyles: {
            fontSize: 7.5,
            textColor: DS.black,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
            valign: 'middle',
            minCellHeight: 8,
            lineWidth: 0,
        },

        alternateRowStyles: {
            fillColor: DS.gray050,
        },

        columnStyles: {
            0: { cellWidth: 22, halign: 'left' },    // Fecha
            1: { cellWidth: 30, halign: 'left' },    // Día
            2: { cellWidth: 20, halign: 'center' },  // Estado
            3: { cellWidth: 22, halign: 'center' },  // Entrada
            4: { cellWidth: 22, halign: 'center' },  // Salida
            5: { halign: 'center' },                  // Horas (ocupa el resto)
        },

        styles: {
            font: DS.font,
            overflow: 'linebreak',
        },

        // Línea horizontal muy fina entre filas
        didDrawCell: (data) => {
            if (data.section === 'body') {
                doc.setDrawColor(...DS.gray100);
                doc.setLineWidth(0.15);
                doc.line(
                    data.cell.x,
                    data.cell.y + data.cell.height,
                    data.cell.x + data.cell.width,
                    data.cell.y + data.cell.height,
                );
            }
        },

        // Línea bajo la cabecera ya la dibuja headStyles.lineWidth, pero
        // también añadimos borde superior de la primera fila body
        willDrawCell: (data) => {
            if (data.section === 'body' && data.row.index === 0 && data.column.index === 0) {
                // nada adicional necesario
            }
        },

        margin: { left: DS.marginH, right: DS.marginH },
    });

    return (doc as any).lastAutoTable?.finalY ?? startY + 5;
}

// ---------------------------------------------------------------------------
// Sección: Pie de página
// ---------------------------------------------------------------------------

function drawFooter(
    doc: jsPDF,
    payload: TimesheetExportPayload,
    exportId: string,
    pageNum: number,
    totalPages: number,
): void {
    const FOOTER_Y = DS.pageH - 10;
    const L = DS.marginH;
    const R = DS.pageW - DS.marginH;

    hLine(doc, FOOTER_Y - 3, L, R);

    const genDate = isoToDisplay(payload.generatedAt.toISOString().slice(0, 10));
    const genTime = `${String(payload.generatedAt.getHours()).padStart(2, '0')}:${String(payload.generatedAt.getMinutes()).padStart(2, '0')}`;

    const lines = [
        'Documento generado automáticamente por el sistema de gestión laboral Marbella OS.',
        `Registro de jornada conforme al artículo 34.9 del Estatuto de los Trabajadores.  ·  Generado el ${genDate} a las ${genTime} h.`,
    ];

    doc.setFont(DS.font, 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...DS.gray500);

    lines.forEach((line, i) => {
        doc.text(line, L, FOOTER_Y - 0.5 + i * 3.8);
    });

    // Paginación — derecha
    doc.setFont(DS.font, 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...DS.gray500);
    doc.text(`${exportId}  ·  Página ${pageNum} de ${totalPages}`, R, FOOTER_Y + 3.3, { align: 'right' });
}

// ---------------------------------------------------------------------------
// Función principal exportada
// ---------------------------------------------------------------------------

/**
 * Genera y descarga el PDF oficial de jornada laboral.
 * Diseño minimalista corporativo — apto para inspecciones de trabajo.
 */
export async function generateTimesheetPdf(payload: TimesheetExportPayload): Promise<void> {
    const exportId = buildExportId(payload.generatedAt);

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    // Carga del logo
    const logoDataUrl = await loadImageAsDataUrl('/icons/logo-white.png');

    // ── PÁGINA 1 ──────────────────────────────────────────────────────────

    // 1. Cabecera
    const afterHeader = await drawHeader(doc, payload, logoDataUrl);

    // 2. Resumen
    const afterSummary = drawSummary(doc, payload, afterHeader + 3);

    // 3. Tabla
    drawTable(doc, payload, afterSummary);

    // 4. Pie en todas las páginas
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(doc, payload, exportId, p, totalPages);

        // En páginas adicionales (paginación de tabla) repetir cabecera mínima
        if (p > 1) {
            doc.setFont(DS.font, 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...DS.gray500);
            doc.text(
                `${payload.employeeFullName}  ·  ${fmtMonthYear(payload.periodYear, payload.periodMonth)}  (cont.)`,
                DS.marginH,
                DS.marginV,
            );
            hLine(doc, DS.marginV + 2, DS.marginH, DS.pageW - DS.marginH);
        }
    }

    // Nombre de archivo
    const monthLabel = format(new Date(payload.periodYear, payload.periodMonth, 1), 'yyyy-MM');
    const employeeSlug = payload.employeeFullName
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

    doc.save(`jornada_${employeeSlug}_${monthLabel}.pdf`);
}

// ---------------------------------------------------------------------------
// Multi‑empleado: exporta todos los empleados seleccionados en un solo PDF
// ---------------------------------------------------------------------------

/**
 * Genera y descarga un PDF combinado con la jornada de varios empleados.
 *
 * Cada empleado se muestra en una sección independiente dentro del mismo
 * documento, con su cabecera, resumen y tabla de fichajes.
 */
export async function generateTimesheetPdfMulti(
    payloads: Array<{
        employee: { fullName: string; dni: string | null };
        payload: TimesheetExportPayload;
    }>,
): Promise<void> {
    if (payloads.length === 0) return;

    const firstPayload = payloads[0].payload;
    const exportId = buildExportId(firstPayload.generatedAt);
    const periodLabel = firstPayload.periodLabel ?? fmtMonthYear(firstPayload.periodYear, firstPayload.periodMonth);
    const logoDataUrl = await loadImageAsDataUrl('/icons/logo-white.png');

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    // ── CABECERA GENERAL (empresa + período) ─────────────────────────────

    const L = DS.marginH;
    const R = DS.pageW - DS.marginH;
    let y = DS.marginV;

    const LOGO_SIZE = 9;
    if (logoDataUrl) {
        doc.setFillColor(...DS.gray050);
        doc.roundedRect(L, y, LOGO_SIZE, LOGO_SIZE, 1, 1, 'F');
        doc.addImage(logoDataUrl, 'PNG', L, y, LOGO_SIZE, LOGO_SIZE);
    }

    const textX = logoDataUrl ? L + LOGO_SIZE + 3.5 : L;
    let textY = y + 3;

    doc.setFont(DS.font, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DS.black);
    doc.text(COMPANY.tradeName, textX, textY);

    doc.setFont(DS.font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...DS.gray700);
    doc.text(COMPANY.legalName, textX, textY + 4.5);

    doc.setFontSize(7);
    doc.setTextColor(...DS.gray500);
    doc.text(`CIF: ${COMPANY.cif}`, textX, textY + 8.5);
    doc.text(COMPANY.address, textX, textY + 12);

    doc.setFont(DS.font, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...DS.black);
    doc.text(periodLabel, R, y + 5, { align: 'right' });

    doc.setFont(DS.font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...DS.gray500);
    doc.text('Generado:', R, y + 11, { align: 'right' });

    const genDate = isoToDisplay(firstPayload.generatedAt.toISOString().slice(0, 10));
    const genTime = `${String(firstPayload.generatedAt.getHours()).padStart(2, '0')}:${String(firstPayload.generatedAt.getMinutes()).padStart(2, '0')}`;
    doc.setFontSize(7.5);
    doc.setTextColor(...DS.gray700);
    doc.text(`${genDate}  ${genTime} h`, R, y + 15, { align: 'right' });

    // Título
    const titleY = y + 23;
    doc.setFont(DS.font, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...DS.black);
    doc.text('INFORME DE REGISTRO DE JORNADA LABORAL — PLANTILLA', L, titleY);

    hLine(doc, titleY + 2.5, L, R);

    let lastY = titleY + 7;

    // ── SECCIÓN POR CADA EMPLEADO ────────────────────────────────────────

    for (let i = 0; i < payloads.length; i++) {
        const { employee, payload } = payloads[i];

        // Si no es el primero y queda poco espacio, nueva página
        if (i > 0) {
            doc.addPage();
            lastY = DS.marginV;

            // Mini‑cabecera de continuación
            doc.setFont(DS.font, 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...DS.gray500);
            doc.text(
                `${COMPANY.tradeName}  ·  ${periodLabel}  ·  Plantilla (cont.)`,
                DS.marginH,
                lastY,
            );
            hLine(doc, lastY + 2, DS.marginH, DS.pageW - DS.marginH);
            lastY += 7;
        }

        // ── Empieza sección del empleado ──────────────────────────────────

        // Título del empleado
        const secY = lastY + 2;

        doc.setFont(DS.font, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...DS.black);
        doc.text(`${i + 1}.  ${employee.fullName}`, L, secY);

        let empInfoY = secY + 6;
        const labelW = 22;
        const col1 = L;
        const col2 = L + 90;

        doc.setFont(DS.font, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...DS.gray500);
        doc.text('Empleado:', col1, empInfoY);
        doc.setFont(DS.font, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...DS.black);
        doc.text(employee.fullName, col1 + labelW, empInfoY);

        if (employee.dni) {
            doc.setFont(DS.font, 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...DS.gray500);
            doc.text('DNI / NIE:', col2, empInfoY);
            doc.setFont(DS.font, 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...DS.black);
            doc.text(employee.dni, col2 + labelW, empInfoY);
        }

        doc.setFont(DS.font, 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...DS.gray500);
        doc.text('Centro de trabajo:', col1, empInfoY + 5);
        doc.setFont(DS.font, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...DS.gray700);
        doc.text(COMPANY.workCenter, col1 + labelW, empInfoY + 5);

        const afterEmp = empInfoY + 10;

        // Resumen (sin primera/última jornada)
        const afterSummary = drawSummaryCompact(doc, payload, afterEmp + 1);

        // Tabla
        drawTable(doc, payload, afterSummary);

        lastY = (doc as any).lastAutoTable?.finalY ?? afterSummary + 5;
        lastY += 6;
    }

    // ── PIE DE PÁGINA ─────────────────────────────────────────────────────

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(doc, firstPayload, exportId, p, totalPages);

        // En páginas adicionales, repetir cabecera mínima
        if (p > 1) {
            // Ya dibujamos mini‑cabeceras manualmente
        }
    }

    const fileSlug = periodLabel
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_|_$/g, '');
    doc.save(`jornada_plantilla_${fileSlug}.pdf`);
}
