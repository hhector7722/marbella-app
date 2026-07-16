import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
    getPlantillaDayClosingMinutes,
    PLANTILLA_SHORT_CLOSE_EVE_DATES,
} from '../src/lib/staff/plantilla-holidays.ts';

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const CLOSED = new Set([
    '2026-01-01', '2026-01-06', '2026-04-03', '2026-04-06',
    '2026-05-01', '2026-05-25', '2026-06-24',
]);

function parsePdf(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on('pdfParser_dataError', (err: { parserError: string }) => reject(new Error(err.parserError)));
        pdfParser.on('pdfParser_dataReady', () => {
            try { resolve(decodeURIComponent(pdfParser.getRawTextContent())); }
            catch { resolve(pdfParser.getRawTextContent()); }
        });
        pdfParser.parseBuffer(buffer);
    });
}

function parseHm(hm: string): number {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

type Row = { date: string; estado: string; in: string; out: string };

function extractRows(text: string): Row[] {
    const rows: Row[] = [];
    const re =
        /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+(Regular|Baja|Festivo|Personal|Fin de semana|Weekend|Overtime)(?:\s+(\d{2}:\d{2}))?(?:\s+(\d{2}:\d{2}))?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (m[4] !== 'Regular' && m[4] !== 'Fin de semana' && m[4] !== 'Weekend' && m[4] !== 'Overtime') continue;
        if (!m[5] || !m[6]) continue;
        rows.push({
            date: `${m[3]}-${m[2]}-${m[1]}`,
            estado: m[4],
            in: m[5],
            out: m[6],
        });
    }
    return rows;
}

async function main() {
    const files = process.argv.slice(2);
    const byDate = new Map<string, Row[]>();

    for (const file of files) {
        if (!fs.existsSync(file)) continue;
        const text = await parsePdf(fs.readFileSync(file));
        for (const row of extractRows(text)) {
            const list = byDate.get(row.date) ?? [];
            list.push(row);
            byDate.set(row.date, list);
        }
    }

    const issues: string[] = [];
    const samples: string[] = [];
    let checked = 0;

    for (const [date, rows] of [...byDate.entries()].sort()) {
        if (CLOSED.has(date)) {
            issues.push(`${date}: festivo con ${rows.length} turnos`);
            continue;
        }
        checked += 1;
        rows.sort((a, b) => parseHm(a.in) - parseHm(b.in));
        const firstIn = parseHm(rows[0].in);
        const lastOut = parseHm(rows[rows.length - 1].out);
        const closeTarget = getPlantillaDayClosingMinutes(date);

        if (firstIn > 8 * 60 + 20) {
            issues.push(`${date}: primera entrada ${rows[0].in} (tarde)`);
        }
        if (lastOut < closeTarget - 25) {
            issues.push(`${date}: última salida ${rows[rows.length - 1].out} (antes de ~${Math.floor(closeTarget / 60)}:00)`);
        }
        if (lastOut > closeTarget + 25) {
            issues.push(`${date}: última salida ${rows[rows.length - 1].out} (después de cierre)`);
        }

        if (samples.length < 6 && rows.length >= 3) {
            samples.push(
                `${date}: ${rows[0].in}→${rows[0].out} … ${rows[rows.length - 1].in}→${rows[rows.length - 1].out} (${rows.length} pers.)`,
            );
        }
    }

    console.log(`Días laborables revisados: ${checked}`);
    console.log(`Vísperas cortas configuradas: ${[...PLANTILLA_SHORT_CLOSE_EVE_DATES].join(', ')}`);
    console.log('\nMuestras (≥3 personas):');
    for (const s of samples) console.log(' ', s);
    if (issues.length === 0) {
        console.log('\n✓ Sin desviaciones graves en ventanas horarias.');
    } else {
        console.log(`\n⚠ ${issues.length} avisos:`);
        for (const i of issues.slice(0, 25)) console.log(' ', i);
        if (issues.length > 25) console.log(`  … y ${issues.length - 25} más`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
