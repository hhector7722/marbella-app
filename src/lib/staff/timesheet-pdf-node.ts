import fs from 'node:fs';
import path from 'node:path';
import { createTimesheetPdfDocument } from './timesheet-pdf';
import type { TimesheetExportPayload } from './timesheet-export-payload';

/** Guarda el PDF de jornada en disco (scripts de validación / CI). */
export async function generateTimesheetPdfNode(
    payload: TimesheetExportPayload,
    filePath: string,
): Promise<void> {
    const logoPath = path.join(process.cwd(), 'public', 'icons', 'logo-white.png');
    const logoDataUrl = fs.existsSync(logoPath)
        ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
        : null;

    const doc = await createTimesheetPdfDocument(payload, logoDataUrl);
    const buffer = Buffer.from(doc.output('arraybuffer'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
}
