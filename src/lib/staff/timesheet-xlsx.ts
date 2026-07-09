/**
 * Generador de Excel oficial de jornada para Inspección de Trabajo.
 *
 * Produce un .xlsx con dos hojas:
 *   - Hoja 1 "Resumen": metadatos del informe
 *   - Hoja 2 "Registro": tabla diaria completa
 *
 * Sin fórmulas complejas, sin celdas combinadas.
 * Apto para filtrar y ordenar directamente en Excel / LibreOffice.
 *
 * Dependencias: xlsx ^0.18
 */

import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimesheetExportPayload, TimesheetDayRow } from './timesheet-export-payload';

// ---------------------------------------------------------------------------
// Helpers de formato (propios de este generador)
// ---------------------------------------------------------------------------

function fmtDate(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

function fmtDateShort(isoDate: string): string {
    const [, m, d] = isoDate.split('-');
    return `${d}/${m}`;
}

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

function fmtGeneratedAt(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${mi}`;
}

function buildExportId(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `EXP-${y}${mo}${d}-${h}${mi}${s}`;
}

const WEEKDAY_NAMES_ES = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles',
    'Jueves', 'Viernes', 'Sábado',
];

// ---------------------------------------------------------------------------
// Hoja 1: Resumen
// ---------------------------------------------------------------------------

function buildResumenSheet(payload: TimesheetExportPayload): XLSX.WorkSheet {
    const exportId = buildExportId(payload.generatedAt);

    // Pares [etiqueta, valor] — sin valores inventados para campos ausentes
    const rows: [string, string][] = [
        ['INFORME OFICIAL DE JORNADA LABORAL', ''],
        ['', ''],
        ['Empresa', payload.companyName],
        ['Empleado', payload.employeeFullName],
    ];

    if (payload.employeeDni) {
        rows.push(['DNI', payload.employeeDni]);
    }

    rows.push(
        ['Período', fmtMonthYear(payload.periodYear, payload.periodMonth)],
        ['', ''],
        ['Jornadas trabajadas', String(payload.totalDays)],
        ['Total horas trabajadas', fmtMinutes(payload.totalWorkedMinutes)],
        ['Primera jornada', payload.firstDayDate ? fmtDate(payload.firstDayDate) : '—'],
        ['Última jornada', payload.lastDayDate ? fmtDate(payload.lastDayDate) : '—'],
        ['', ''],
        ['Fecha de generación', fmtGeneratedAt(payload.generatedAt)],
        ['ID de exportación', exportId],
        ['', ''],
        ['Generado por', 'Marbella OS'],
    );

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Ancho de columnas
    ws['!cols'] = [
        { wch: 30 },  // etiqueta
        { wch: 35 },  // valor
    ];

    return ws;
}

// ---------------------------------------------------------------------------
// Hoja 2: Registro diario
// ---------------------------------------------------------------------------

function buildRegistroSheet(payload: TimesheetExportPayload): XLSX.WorkSheet {
    const header = ['Fecha', 'Día', 'Entrada', 'Salida', 'Horas trabajadas'];

    const dataRows = payload.rows.map((row: TimesheetDayRow) => [
        fmtDate(row.date),
        WEEKDAY_NAMES_ES[row.weekday] ?? '',
        row.clockIn ?? '—',
        row.clockOut ?? '—',
        fmtMinutes(row.workedMinutes),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

    // Ancho de columnas
    ws['!cols'] = [
        { wch: 14 },  // Fecha
        { wch: 14 },  // Día
        { wch: 12 },  // Entrada
        { wch: 12 },  // Salida
        { wch: 18 },  // Horas trabajadas
    ];

    // Rango de auto-filtro sobre la cabecera
    const lastRow = dataRows.length + 1; // +1 por la cabecera (1-indexed)
    ws['!autofilter'] = { ref: `A1:E${lastRow}` };

    return ws;
}

// ---------------------------------------------------------------------------
// Función principal exportada
// ---------------------------------------------------------------------------

/**
 * Genera y descarga el Excel oficial de jornada para Inspección de Trabajo.
 */
export function generateTimesheetXlsx(payload: TimesheetExportPayload): void {
    const wb = XLSX.utils.book_new();

    const wsResumen = buildResumenSheet(payload);
    const wsRegistro = buildRegistroSheet(payload);

    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsRegistro, 'Registro diario');

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

    XLSX.writeFile(wb, `jornada_${employeeSlug}_${monthLabel}.xlsx`, { compression: true });
}
