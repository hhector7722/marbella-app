/**
 * Genera PDF de jornada (modelo inspección) para Jose Delgado — enero 2026.
 * Datos legacy importados manualmente (sin perfil en BD).
 *
 * Uso:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/generate-jose-delgado-timesheet.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TimesheetDayRow, TimesheetExportPayload } from '../src/lib/staff/timesheet-export-payload.ts';
import { createTimesheetPdfDocument } from '../src/lib/staff/timesheet-pdf.ts';

const COMPANY_NAME = 'Bar La Marbella / Fogo Torrat S.L.';

type RawShift = {
    date: string; // YYYY-MM-DD
    clockIn: string; // HH:mm:ss
    clockOut: string | null;
};

/** Fichajes legacy (enero 2026). Sortida = salida. */
const SHIFTS: RawShift[] = [
    { date: '2026-01-05', clockIn: '09:04:00', clockOut: '15:12:00' },
    { date: '2026-01-08', clockIn: '09:04:00', clockOut: null },
    { date: '2026-01-09', clockIn: '08:38:49', clockOut: '16:28:00' },
    { date: '2026-01-10', clockIn: '08:52:00', clockOut: '17:01:00' },
    { date: '2026-01-11', clockIn: '08:59:00', clockOut: '16:59:00' },
    { date: '2026-01-12', clockIn: '12:36:00', clockOut: null },
    { date: '2026-01-15', clockIn: '09:03:46', clockOut: '17:06:00' },
    // 16/01 omitido: entrada y salida 17:01 (fichaje erróneo, 0 h)
    { date: '2026-01-17', clockIn: '08:59:00', clockOut: '16:55:00' },
    { date: '2026-01-18', clockIn: '08:56:00', clockOut: '16:55:00' },
    { date: '2026-01-19', clockIn: '09:09:00', clockOut: '17:06:00' },
    { date: '2026-01-22', clockIn: '09:08:00', clockOut: '17:00:00' },
    { date: '2026-01-23', clockIn: '09:06:00', clockOut: '16:35:00' },
    { date: '2026-01-24', clockIn: '09:04:00', clockOut: '16:58:00' },
    { date: '2026-01-25', clockIn: '09:03:00', clockOut: '16:55:00' },
    { date: '2026-01-26', clockIn: '09:08:00', clockOut: '17:01:00' },
    { date: '2026-01-29', clockIn: '09:10:28', clockOut: '17:03:00' },
    { date: '2026-01-30', clockIn: '09:04:00', clockOut: null },
    { date: '2026-01-31', clockIn: '07:57:00', clockOut: '16:24:00' },
];

function hmFromHms(hms: string): string {
    const [h, m] = hms.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function minutesBetween(date: string, clockIn: string, clockOut: string): number {
    const [y, mo, d] = date.split('-').map(Number);
    const [ih, im, is = 0] = clockIn.split(':').map(Number);
    const [oh, om, os = 0] = clockOut.split(':').map(Number);
    const start = new Date(y, mo - 1, d, ih, im, is);
    const end = new Date(y, mo - 1, d, oh, om, os);
    const diff = Math.round((end.getTime() - start.getTime()) / 60_000);
    return diff > 0 ? diff : 0;
}

function buildRows(shifts: RawShift[]): TimesheetDayRow[] {
    return shifts.map((shift) => {
        const [y, mo, d] = shift.date.split('-').map(Number);
        const weekday = new Date(y, mo - 1, d).getDay();
        const workedMinutes = shift.clockOut
            ? minutesBetween(shift.date, shift.clockIn, shift.clockOut)
            : 0;

        return {
            date: shift.date,
            weekday,
            clockIn: hmFromHms(shift.clockIn),
            clockOut: shift.clockOut ? hmFromHms(shift.clockOut) : null,
            workedMinutes,
            displayMinutes: workedMinutes,
            eventType: 'regular',
            hasLog: true,
        };
    });
}

function buildPayload(rows: TimesheetDayRow[]): TimesheetExportPayload {
    const totalWorkedMinutes = rows.reduce((acc, r) => acc + r.workedMinutes, 0);
    const totalDisplayMinutes = rows.reduce((acc, r) => acc + r.displayMinutes, 0);

    return {
        companyName: COMPANY_NAME,
        employeeFullName: 'Jose Delgado',
        employeeDni: null,
        periodYear: 2026,
        periodMonth: 0,
        generatedAt: new Date(),
        totalDays: rows.length,
        totalWorkedMinutes,
        totalDisplayMinutes,
        contractedHoursWeekly: 40,
        firstDayDate: rows[0]?.date ?? null,
        lastDayDate: rows[rows.length - 1]?.date ?? null,
        rows,
    };
}

const rows = buildRows(SHIFTS);
const payload = buildPayload(rows);

const outPath = path.join(
    process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(),
    'Downloads',
    'jornada_jose_delgado_2026-01.pdf',
);

const logoPath = path.join(process.cwd(), 'public', 'icons', 'logo-white.png');
const logoDataUrl = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : null;

const doc = await createTimesheetPdfDocument(payload, logoDataUrl);
const buffer = Buffer.from(doc.output('arraybuffer'));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buffer);

const totalH = Math.floor(payload.totalDisplayMinutes / 60);
const totalM = payload.totalDisplayMinutes % 60;
console.log(`PDF generado: ${outPath}`);
console.log(`Jornadas: ${payload.totalDays} · Total: ${totalH} h ${totalM} min`);
