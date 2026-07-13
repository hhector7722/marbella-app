/**
 * Genera un calendario HTML (estilo vista Plantilla de Asistencia) a partir de PDFs de jornada.
 *
 * Uso:
 *   npx tsx scripts/generate-plantilla-calendar-from-pdfs.ts path/to/a.pdf path/to/b.pdf ...
 *   npx tsx scripts/generate-plantilla-calendar-from-pdfs.ts --downloads
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PLANTILLA_CLOSED_HOLIDAYS_2026 } from '../src/lib/staff/plantilla-holidays.ts';

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const WEEK_SUMMARY_HEADER = 'HORAS SEM.';
const MONTH_NAMES = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

type ShiftLog = {
    employeeName: string;
    initials: string;
    clockIn: string;
    clockOut: string;
    eventType: string;
    hours: number;
};

type DayShifts = {
    date: string;
    logs: ShiftLog[];
};

async function parsePdfTimesheet(filePath: string): Promise<{ employeeName: string; shifts: DayShifts[] }> {
    const buf = fs.readFileSync(filePath);
    const text = await awaitParsePdf(buf);

    const nameMatch = text.match(/Empleado:\s*\r?\n([^\r\n]+?)\s{2,}DNI/i)
        ?? text.match(/Empleado:\s*([^\r\n]+?)\s{2,}DNI/i);
    const employeeName = (nameMatch?.[1] ?? path.basename(filePath)).trim();

    const rowRe =
        /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+(Regular|Festivo|Baja|Personal|Enfermedad|Fin de semana|Weekend|Overtime)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2})\s+h\s+(\d{2})\s+min/gi;
    const bajaRowRe =
        /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+Baja\s+(\d{2})\s+h\s+(\d{2})\s+min/gi;

    const byDate = new Map<string, ShiftLog[]>();
    let match: RegExpExecArray | null;
    const initials = buildInitials(employeeName);

    const pushLog = (
        date: string,
        eventType: string,
        clockIn: string,
        clockOut: string,
        hours: number,
    ) => {
        const log: ShiftLog = {
            employeeName,
            initials,
            clockIn,
            clockOut,
            eventType,
            hours,
        };
        const list = byDate.get(date) ?? [];
        list.push(log);
        byDate.set(date, list);
    };

    while ((match = rowRe.exec(text))) {
        const date = `${match[3]}-${match[2]}-${match[1]}`;
        const eventType = normalizeEventType(match[4]);
        if (eventType !== 'regular' && eventType !== 'weekend' && eventType !== 'overtime') {
            continue;
        }
        const hours = Number(match[7]) + Number(match[8]) / 60;
        pushLog(date, eventType, match[5], match[6], hours);
    }

    while ((match = bajaRowRe.exec(text))) {
        const date = `${match[3]}-${match[2]}-${match[1]}`;
        const hours = Number(match[4]) + Number(match[5]) / 60;
        pushLog(date, 'adjustment', '', '', hours);
    }

    const shifts = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, logs]) => ({ date, logs }));

    return { employeeName, shifts };
}

function normalizeEventType(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes('fin de semana') || lower === 'weekend') return 'weekend';
    if (lower === 'overtime') return 'overtime';
    if (lower === 'regular') return 'regular';
    if (lower.includes('festivo')) return 'holiday';
    if (lower.includes('baja')) return 'adjustment';
    if (lower.includes('personal')) return 'personal';
    if (lower.includes('enfermedad')) return 'weekend';
    return 'regular';
}

function awaitParsePdf(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on('pdfParser_dataError', (err: { parserError: string }) => {
            reject(new Error(err.parserError));
        });
        pdfParser.on('pdfParser_dataReady', () => {
            try {
                resolve(decodeURIComponent(pdfParser.getRawTextContent()));
            } catch {
                resolve(pdfParser.getRawTextContent());
            }
        });
        pdfParser.parseBuffer(buffer);
    });
}

function buildInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
    return first + last;
}

function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function mondayOnOrBefore(d: Date): Date {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd = r.getDay();
    r.setDate(r.getDate() - (wd === 0 ? 6 : wd - 1));
    return r;
}

function sundayOnOrAfter(d: Date): Date {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd = r.getDay();
    if (wd !== 0) r.setDate(r.getDate() + (7 - wd));
    return r;
}

function buildMonthWeeks(year: number, month0: number): Array<Array<{ date: string; dayNumber: number; isOtherMonth: boolean }>> {
    const first = new Date(year, month0, 1);
    const last = new Date(year, month0 + 1, 0);
    const start = mondayOnOrBefore(first);
    const end = sundayOnOrAfter(last);

    const weeks: Array<Array<{ date: string; dayNumber: number; isOtherMonth: boolean }>> = [];
    const cursor = new Date(start);

    while (cursor <= end) {
        const week: Array<{ date: string; dayNumber: number; isOtherMonth: boolean }> = [];
        for (let i = 0; i < 7; i++) {
            week.push({
                date: ymd(cursor),
                dayNumber: cursor.getDate(),
                isOtherMonth: cursor.getMonth() !== month0,
            });
            cursor.setDate(cursor.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
}

function isClosedHoliday(date: string): boolean {
    return PLANTILLA_CLOSED_HOLIDAYS_2026.has(date.slice(0, 10));
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isWorkingShift(log: ShiftLog): boolean {
    return log.eventType === 'regular' || log.eventType === 'weekend' || log.eventType === 'overtime';
}

function renderDayCell(date: string, dayNumber: number, isOtherMonth: boolean, logs: ShiftLog[]): string {
    const workingStaff = logs.filter(isWorkingShift).length;
    const lowStaff = !isClosedHoliday(date) && !isOtherMonth && workingStaff > 0 && workingStaff < 3;
    const emptyHoliday = isClosedHoliday(date) && workingStaff === 0;

    const logsHtml = logs
        .slice(0, 6)
        .map((log) => {
            if (log.eventType === 'adjustment') {
                return `
          <div class="log-row baja">
            <span class="avatar baja-avatar">B</span>
            <span class="times baja-label">Baja · 8 h</span>
          </div>`;
            }
            return `
          <div class="log-row">
            <span class="avatar">${escapeHtml(log.initials)}</span>
            <span class="times">
              <span class="in">${escapeHtml(log.clockIn)}</span>
              <span class="sep">-</span>
              <span class="out">${escapeHtml(log.clockOut)}</span>
            </span>
          </div>`;
        })
        .join('');

    const more = logs.length > 6 ? `<div class="more">+${logs.length - 6} más</div>` : '';
    const badge =
        lowStaff ? `<div class="warn" title="Menos de 3 personas">⚠ ${workingStaff}</div>` :
        emptyHoliday ? `<div class="ok-holiday" title="Festivo cerrado">✓</div>` :
        '';

    return `
      <div class="day ${isOtherMonth ? 'other-month' : ''} ${lowStaff ? 'low-staff' : ''}">
        <span class="day-num">${dayNumber}</span>
        ${badge}
        <div class="logs">${logsHtml}${more}</div>
      </div>`;
}

function weekStartKey(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const monday = mondayOnOrBefore(new Date(y, m - 1, d));
    return ymd(monday);
}

function buildWeeklyHoursMap(byDate: Map<string, ShiftLog[]>): Map<string, Map<string, number>> {
    const weekly = new Map<string, Map<string, number>>();

    for (const [date, logs] of byDate) {
        const weekKey = weekStartKey(date);
        const bucket = weekly.get(weekKey) ?? new Map<string, number>();

        for (const log of logs) {
            const prev = bucket.get(log.employeeName) ?? 0;
            bucket.set(log.employeeName, prev + log.hours);
        }

        weekly.set(weekKey, bucket);
    }

    return weekly;
}

function fmtHours(h: number): string {
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    return mins === 0 ? `${whole} h` : `${whole} h ${mins} min`;
}

function renderWeekSummaryCell(weekStart: string, weeklyHours: Map<string, Map<string, number>>): string {
    const bucket = weeklyHours.get(weekStart);
    if (!bucket || bucket.size === 0) {
        return `<div class="week-summary"><div class="week-summary-empty">—</div></div>`;
    }

    const rows = [...bucket.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es'))
        .map(([name, hours]) => `
          <div class="week-summary-row">
            <span class="week-summary-name">${escapeHtml(name)}</span>
            <span class="week-summary-hours">${escapeHtml(fmtHours(hours))}</span>
          </div>`)
        .join('');

    return `<div class="week-summary">${rows}</div>`;
}

function renderMonth(
    year: number,
    month0: number,
    byDate: Map<string, ShiftLog[]>,
    weeklyHours: Map<string, Map<string, number>>,
): string {
    const weeks = buildMonthWeeks(year, month0);
    const monthLabel = `${MONTH_NAMES[month0]} DE ${year}`;

    const weeksHtml = weeks
        .map((week, idx) => {
            const header =
                idx === 0
                    ? `<div class="dow">${DAY_HEADERS.map((d) => `<span>${d}</span>`).join('')}<span class="week-col">${WEEK_SUMMARY_HEADER}</span></div>`
                    : '';
            const days = week
                .map((day) => renderDayCell(day.date, day.dayNumber, day.isOtherMonth, byDate.get(day.date) ?? []))
                .join('');
            const summary = renderWeekSummaryCell(week[0].date, weeklyHours);
            return `${header}<div class="week">${days}${summary}</div>`;
        })
        .join('');

    return `
      <section class="month-block">
        <div class="month-badge">${monthLabel}</div>
        <div class="month-card">${weeksHtml}</div>
      </section>`;
}

function buildHtml(
    byDate: Map<string, ShiftLog[]>,
    weeklyHours: Map<string, Map<string, number>>,
    employeeCount: number,
    sourceFiles: string[],
): string {
    const dates = [...byDate.keys()].sort();
    const minDate = dates[0] ?? '2026-01-01';
    const maxDate = dates[dates.length - 1] ?? '2026-12-31';
    const startMonth = Number(minDate.slice(5, 7)) - 1;
    const endMonth = Number(maxDate.slice(5, 7)) - 1;
    const year = Number(minDate.slice(0, 4));

    const months: string[] = [];
    for (let m = startMonth; m <= endMonth; m++) {
        months.push(renderMonth(year, m, byDate, weeklyHours));
    }

    const issues: string[] = [];
    for (const [date, logs] of byDate) {
        const workingStaff = logs.filter(isWorkingShift).length;
        if (!isClosedHoliday(date) && workingStaff > 0 && workingStaff < 3) {
            issues.push(`${date}: ${workingStaff} (${logs.filter(isWorkingShift).map((l) => l.initials).join(', ')})`);
        }
        if (isClosedHoliday(date) && workingStaff > 0) {
            issues.push(`${date}: festivo con ${workingStaff} turnos`);
        }
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plantilla simulación — calendario</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      background: #3f4f5a;
      color: #111;
      padding: 24px 16px 48px;
    }
    .page-title {
      color: #fff;
      text-align: center;
      margin: 0 0 8px;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .page-meta {
      color: rgba(255,255,255,0.75);
      text-align: center;
      font-size: 12px;
      margin-bottom: 28px;
    }
    .month-block { margin-bottom: 28px; max-width: 1040px; margin-left: auto; margin-right: auto; }
    .month-badge {
      display: inline-block;
      background: #4b5563;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      padding: 8px 14px;
      border-radius: 10px;
      margin-bottom: 8px;
    }
    .month-card {
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      box-shadow: 0 2px 10px rgba(0,0,0,0.12);
    }
    .dow {
      display: grid;
      grid-template-columns: repeat(7, 1fr) minmax(108px, 1.15fr);
      background: linear-gradient(to bottom, #ef4444, #dc2626);
    }
    .dow span {
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      padding: 6px 2px;
      border-right: 1px solid rgba(255,255,255,0.25);
    }
    .dow span:last-child { border-right: 0; }
    .dow span.week-col {
      font-size: 8px;
      letter-spacing: 0.04em;
      padding-left: 4px;
      padding-right: 4px;
    }
    .week {
      display: grid;
      grid-template-columns: repeat(7, 1fr) minmax(108px, 1.15fr);
      border-bottom: 1px solid #f3f4f6;
    }
    .week:last-child { border-bottom: 0; }
    .day {
      position: relative;
      min-height: 88px;
      border-right: 1px solid #f3f4f6;
      padding: 4px;
      background: #fff;
    }
    .day:last-child { border-right: 0; }
    .day.other-month { opacity: 0.45; }
    .day.low-staff { background: #fff7ed; }
    .day-num {
      position: absolute;
      top: 4px;
      right: 6px;
      font-size: 9px;
      font-weight: 700;
      color: #9ca3af;
    }
    .warn {
      position: absolute;
      top: 4px;
      left: 4px;
      font-size: 8px;
      font-weight: 800;
      color: #c2410c;
      background: #ffedd5;
      border-radius: 4px;
      padding: 1px 4px;
    }
    .ok-holiday {
      position: absolute;
      top: 4px;
      left: 4px;
      font-size: 8px;
      color: #059669;
    }
    .logs {
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .log-row {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .avatar {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #059669;
      color: #fff;
      font-size: 6.5px;
      font-weight: 900;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .baja-avatar { background: #ea580c; }
    .baja-label { color: #c2410c; font-family: system-ui, sans-serif; font-size: 7px; font-weight: 800; }
    .times {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      font-family: ui-monospace, monospace;
      font-size: 8px;
      font-weight: 700;
    }
    .in { color: #059669; }
    .sep { color: #d1d5db; font-size: 7px; }
    .out { color: #e11d48; }
    .more { font-size: 7px; color: #9ca3af; font-weight: 700; padding-left: 18px; }
    .week-summary {
      border-left: 1px solid #e5e7eb;
      background: #f9fafb;
      padding: 4px 5px;
      min-height: 88px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
    }
    .week-summary-empty {
      color: #9ca3af;
      font-size: 9px;
      text-align: center;
      margin-top: 28px;
    }
    .week-summary-row {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .week-summary-name {
      font-size: 7px;
      font-weight: 700;
      color: #374151;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .week-summary-hours {
      font-size: 7px;
      font-weight: 800;
      color: #111827;
      font-family: ui-monospace, monospace;
    }
    .issues {
      max-width: 1040px;
      margin: 32px auto 0;
      background: rgba(255,255,255,0.95);
      border-radius: 12px;
      padding: 16px;
      font-size: 12px;
    }
    .issues h2 { margin: 0 0 8px; font-size: 13px; }
    .issues ul { margin: 0; padding-left: 18px; }
    .issues li { margin: 2px 0; }
    .issues.empty { color: #059669; font-weight: 700; }
  </style>
</head>
<body>
  <h1 class="page-title">Calendario plantilla — simulación</h1>
  <p class="page-meta">${employeeCount} empleados · ${dates.length} días con turno · generado ${new Date().toLocaleString('es-ES')}</p>
  ${months.join('\n')}
  <div class="issues ${issues.length === 0 ? 'empty' : ''}">
    <h2>Revisión rápida</h2>
    ${
        issues.length === 0
            ? '<p>✓ Sin festivos con turno ni días laborables con menos de 3 personas (en el rango exportado).</p>'
            : `<ul>${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    }
    <p style="margin:12px 0 0;color:#6b7280;font-size:11px">Fuentes: ${sourceFiles.map((f) => escapeHtml(path.basename(f))).join(', ')}</p>
  </div>
</body>
</html>`;
}

const DEFAULT_DOWNLOADS_PDFS = [
    'jornada_alba_masia_de_pablo_2026-01.pdf',
    'jornada_hernan_david_gutierrez_2026-01.pdf',
    'jornada_hugo_rubio_larripa_2026-01.pdf',
    'jornada_mamadou_ndiaye_2026-01.pdf',
    'jornada_pau_costa_guirguet_2026-01.pdf',
    'jornada_pere_boladeres_2026-01.pdf',
    'jornada_silvia_valiente_2026-01.pdf',
    'jornada_bali_more_nafria_2026-01.pdf',
    'jornada_hector_sanchez_arranz_2026-01.pdf',
    'jornada_mouad_aoudane_2026-01.pdf',
    'jornada_juan_jesus_alvez_de_olivera_2026-01.pdf',
    'jornada_willy_ruiz_2026-01.pdf',
    'jornada_lucia_rodero_2026-01.pdf',
    'jornada_marti_esteve_2026-01.pdf',
];

async function main() {
    const args = process.argv.slice(2);
    let pdfPaths: string[];

    if (args.length === 0 || args.includes('--downloads')) {
        const downloads = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Downloads');
        pdfPaths = DEFAULT_DOWNLOADS_PDFS.map((f) => path.join(downloads, f));
    } else {
        pdfPaths = args.map((p) => path.resolve(p));
    }

    const missing = pdfPaths.filter((p) => !fs.existsSync(p));
    if (missing.length > 0) {
        console.error('PDFs no encontrados:');
        missing.forEach((p) => console.error('  -', p));
        process.exit(1);
    }

    const byDate = new Map<string, ShiftLog[]>();
    const employees = new Set<string>();

    for (const pdfPath of pdfPaths) {
        const { employeeName, shifts } = await parsePdfTimesheet(pdfPath);
        employees.add(employeeName);
        console.log(`✓ ${employeeName}: ${shifts.length} días`);

        for (const { date, logs } of shifts) {
            const existing = byDate.get(date) ?? [];
            byDate.set(date, [...existing, ...logs]);
        }
    }

    for (const [date, logs] of byDate) {
        logs.sort((a, b) => a.initials.localeCompare(b.initials));
        byDate.set(date, logs);
    }

    const html = buildHtml(byDate, buildWeeklyHoursMap(byDate), employees.size, pdfPaths);
    const outPath = path.join(
        path.dirname(pdfPaths[0]),
        'plantilla_calendario_simulacion_2026.html',
    );
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`\nCalendario generado: ${outPath}`);
    console.log(`Abre el archivo en el navegador para revisar mes a mes.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
