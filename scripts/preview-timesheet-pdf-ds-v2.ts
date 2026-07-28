/**
 * Preview jornada DS v2 con datos demo (para validar migración).
 *
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/preview-timesheet-pdf-ds-v2.ts
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createTimesheetPdfDocument } from '../src/lib/staff/timesheet-pdf.ts'
import type { TimesheetExportPayload } from '../src/lib/staff/timesheet-export-payload.ts'

const payload: TimesheetExportPayload = {
  companyName: 'Bar La Marbella',
  employeeFullName: 'Pere Boladeres',
  employeeDni: '12345678A',
  periodYear: 2026,
  periodMonth: 6,
  generatedAt: new Date(2026, 6, 28, 10, 15, 0),
  totalDays: 5,
  totalWorkedMinutes: 2400,
  totalDisplayMinutes: 2400,
  contractedHoursWeekly: 40,
  firstDayDate: '2026-07-01',
  lastDayDate: '2026-07-05',
  rows: [
    {
      date: '2026-07-01',
      weekday: 3,
      clockIn: '09:00',
      clockOut: '17:00',
      workedMinutes: 480,
      displayMinutes: 480,
      eventType: 'regular',
      hasLog: true,
    },
    {
      date: '2026-07-02',
      weekday: 4,
      clockIn: '10:00',
      clockOut: '18:30',
      workedMinutes: 510,
      displayMinutes: 510,
      eventType: 'regular',
      hasLog: true,
    },
    {
      date: '2026-07-03',
      weekday: 5,
      clockIn: '09:15',
      clockOut: '17:15',
      workedMinutes: 480,
      displayMinutes: 480,
      eventType: 'regular',
      hasLog: true,
    },
    {
      date: '2026-07-04',
      weekday: 6,
      clockIn: null,
      clockOut: null,
      workedMinutes: 0,
      displayMinutes: 480,
      eventType: 'adjustment',
      hasLog: true,
    },
    {
      date: '2026-07-05',
      weekday: 0,
      clockIn: '11:00',
      clockOut: '19:00',
      workedMinutes: 480,
      displayMinutes: 480,
      eventType: 'regular',
      hasLog: true,
    },
  ],
}

const logoPath = join(process.cwd(), 'public', 'icons', 'logo-white.png')
const logoDataUrl = existsSync(logoPath)
  ? `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
  : null

const doc = await createTimesheetPdfDocument(payload, logoDataUrl)
const outDir = join(process.cwd(), 'tmp')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'preview-jornada-ds-v2.pdf')
writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')))
console.log(`OK → ${outPath}`)
