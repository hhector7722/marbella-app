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
import { downloadWorkbook } from '@/lib/export/browser-output';
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
    if (minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min`;
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

function estadoLabel(eventType: string): string {
    return eventType === 'adjustment' ? 'Baja' : 'Regular';
}

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
    const header = ['Fecha', 'Día', 'Estado', 'Entrada', 'Salida', 'Horas computadas'];

    const dataRows = payload.rows.map((row: TimesheetDayRow) => [
        fmtDate(row.date),
        WEEKDAY_NAMES_ES[row.weekday] ?? '',
        estadoLabel(row.eventType),
        row.eventType === 'adjustment' ? '' : (row.clockIn ?? ''),
        row.eventType === 'adjustment' ? '' : (row.clockOut ?? ''),
        fmtMinutes(row.displayMinutes),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

    // Ancho de columnas
    ws['!cols'] = [
        { wch: 14 },  // Fecha
        { wch: 14 },  // Día
        { wch: 10 },  // Estado
        { wch: 12 },  // Entrada
        { wch: 12 },  // Salida
        { wch: 16 },  // Horas
    ];

    // Rango de auto-filtro sobre la cabecera
    const lastRow = dataRows.length + 1; // +1 por la cabecera (1-indexed)
    ws['!autofilter'] = { ref: `A1:F${lastRow}` };

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

    downloadWorkbook(wb, `jornada_${employeeSlug}_${monthLabel}.xlsx`);
}

// ---------------------------------------------------------------------------
// Multi‑empleado: exporta varios empleados en un mismo Excel
// ---------------------------------------------------------------------------

/**
 * Genera y descarga un Excel combinado con la jornada de varios empleados.
 *
 * Hojas:
 *   - "Resumen": un empleado por fila con totales agregados
 *   - "Registro diario": todas las filas de todos los empleados,
 *     con columna "Empleado" para filtrar/ordenar
 */
export function generateTimesheetXlsxMulti(
    payloads: Array<{
        employee: { fullName: string; dni: string | null };
        payload: TimesheetExportPayload;
    }>,
): void {
    if (payloads.length === 0) return;

    const wb = XLSX.utils.book_new();

    // ── HOJA 1: RESUMEN ───────────────────────────────────────────────────

    const resumenHeader = ['Empleado', 'DNI', 'Jornadas', 'Total horas'];
    const resumenBody = payloads.map(({ employee, payload }) => [
        employee.fullName,
        employee.dni ?? '—',
        payload.totalDays,
        fmtMinutes(payload.totalWorkedMinutes),
    ]);

    const wsResumen = XLSX.utils.aoa_to_sheet([resumenHeader, ...resumenBody]);
    wsResumen['!cols'] = [
        { wch: 30 },
        { wch: 16 },
        { wch: 10 },
        { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // ── HOJA 2: REGISTRO DIARIO ───────────────────────────────────────────

    const registroHeader = ['Empleado', 'Fecha', 'Día', 'Estado', 'Entrada', 'Salida', 'Horas computadas'];
    const registroBody: (string | number)[][] = [];

    for (const { employee, payload } of payloads) {
        for (const row of payload.rows) {
            registroBody.push([
                employee.fullName,
                fmtDate(row.date),
                WEEKDAY_NAMES_ES[row.weekday] ?? '',
                estadoLabel(row.eventType),
                row.eventType === 'adjustment' ? '' : (row.clockIn ?? ''),
                row.eventType === 'adjustment' ? '' : (row.clockOut ?? ''),
                fmtMinutes(row.displayMinutes),
            ]);
        }
    }

    const wsRegistro = XLSX.utils.aoa_to_sheet([registroHeader, ...registroBody]);
    wsRegistro['!cols'] = [
        { wch: 28 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 16 },
    ];

    const lastRow = registroBody.length + 1;
    wsRegistro['!autofilter'] = { ref: `A1:G${lastRow}` };

    XLSX.utils.book_append_sheet(wb, wsRegistro, 'Registro diario');

    // ── NOMBRE DE ARCHIVO ─────────────────────────────────────────────────

    const firstPayload = payloads[0].payload;
    const label = firstPayload.periodLabel
        ? firstPayload.periodLabel
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/^_|_$/g, '')
        : format(new Date(firstPayload.periodYear, firstPayload.periodMonth, 1), 'yyyy-MM');

    downloadWorkbook(wb, `jornada_plantilla_${label}.xlsx`);
}
