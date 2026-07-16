import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const CLOSED_HOLIDAYS = new Set([
    '2026-01-01', '2026-01-06', '2026-04-03', '2026-04-06',
    '2026-05-01', '2026-05-25', '2026-06-24',
]);

function parsePdf(buffer: Buffer): Promise<string> {
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

type Row = { date: string; estado: string; clockIn: string; clockOut: string };

function extractRows(text: string): Row[] {
    const rows: Row[] = [];
    const rowRe =
        /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+(Regular|Baja|Festivo|Personal|Fin de semana|Weekend|Overtime)(?:\s+(\d{2}:\d{2}))?(?:\s+(\d{2}:\d{2}))?/gi;
    const bajaRe = /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+Baja\b/gi;

    let match: RegExpExecArray | null;
    while ((match = rowRe.exec(text))) {
        rows.push({
            date: `${match[3]}-${match[2]}-${match[1]}`,
            estado: match[4],
            clockIn: match[5] ?? '',
            clockOut: match[6] ?? '',
        });
    }

    while ((match = bajaRe.exec(text))) {
        const date = `${match[3]}-${match[2]}-${match[1]}`;
        if (!rows.some((r) => r.date === date && r.estado === 'Baja')) {
            rows.push({ date, estado: 'Baja', clockIn: '', clockOut: '' });
        }
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function auditFile(filePath: string) {
    const text = await parsePdf(fs.readFileSync(filePath));
    const rows = extractRows(text);
    const bajas = rows.filter((r) => r.estado === 'Baja');
    const bajaWithTimes = bajas.filter((r) => r.clockIn || r.clockOut);
    const holidayWork = rows.filter(
        (r) => CLOSED_HOLIDAYS.has(r.date) && r.estado === 'Regular' && r.clockIn && r.clockOut,
    );

    return {
        file: path.basename(filePath),
        totalRows: rows.length,
        bajas: bajas.length,
        bajaDates: bajas.map((r) => r.date),
        bajaWithTimes,
        holidayWork,
    };
}

async function main() {
    const files = process.argv.slice(2);
    if (files.length === 0) {
        console.error('Uso: npx tsx scripts/audit-pdf-bajas.ts file1.pdf file2.pdf ...');
        process.exit(1);
    }

    let totalBajas = 0;
    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.log(`✗ No existe: ${file}`);
            continue;
        }
        const r = await auditFile(file);
        totalBajas += r.bajas;
        console.log(`\n=== ${r.file} ===`);
        console.log(`Días en PDF: ${r.totalRows}`);
        console.log(`Bajas: ${r.bajas}${r.bajas ? ` → ${r.bajaDates.join(', ')}` : ''}`);
        if (r.bajaWithTimes.length > 0) {
            console.log(`⚠ Bajas con horario: ${JSON.stringify(r.bajaWithTimes)}`);
        }
        if (r.holidayWork.length > 0) {
            console.log(`⚠ Festivos con turno: ${r.holidayWork.map((h) => h.date).join(', ')}`);
        }
    }
    console.log(`\n--- Total bajas en lote: ${totalBajas} ---`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
