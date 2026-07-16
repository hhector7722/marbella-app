import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const TARGET = '2026-06-29';
const PDFS = [
    'jornada_mouad_aoudane_2026-01.pdf',
    'jornada_juan_jesus_alvez_de_olivera_2026-01.pdf',
    'jornada_willy_ruiz_2026-01.pdf',
    'jornada_lucia_rodero_2026-01.pdf',
    'jornada_pere_boladeres_2026-01.pdf',
    'jornada_alba_masia_de_pablo_2026-01.pdf',
    'jornada_hugo_rubio_larripa_2026-01.pdf',
    'jornada_hernan_david_gutierrez_2026-01.pdf',
    'jornada_pau_costa_guirguet_2026-01.pdf',
    'jornada_mamadou_ndiaye_2026-01.pdf',
    'jornada_marti_esteve_2026-01.pdf',
    'jornada_silvia_valiente_2026-01.pdf',
    'jornada_bali_more_nafria_2026-01.pdf',
    'jornada_hector_sanchez_arranz_2026-01.pdf',
];

function buildInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
    return first + last;
}

function parsePdf(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on('pdfParser_dataError', (err: { parserError: string }) => reject(new Error(err.parserError)));
        pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
        pdfParser.parseBuffer(buffer);
    });
}

type Row = { name: string; initials: string; type: string; in: string; out: string; hours: number };

async function parseEmployee(downloads: string, file: string): Promise<Row[]> {
    const text = await parsePdf(fs.readFileSync(path.join(downloads, file)));
    const nameMatch = text.match(/Empleado:\s*\r?\n([^\r\n]+?)\s{2,}DNI/i)
        ?? text.match(/Empleado:\s*([^\r\n]+?)\s{2,}DNI/i);
    const name = (nameMatch?.[1] ?? file).trim();
    const initials = buildInitials(name);
    const rows: Row[] = [];

    const rowRe =
        /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+(Regular|Festivo|Baja|Personal|Enfermedad|Fin de semana|Weekend|Overtime)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d{2})\s+h\s+(\d{2})\s+min/gi;
    const bajaRe = /(\d{2})\/(\d{2})\/(\d{4})\s+\S+\s+Baja\s+(\d{2})\s+h\s+(\d{2})\s+min/gi;

    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(text))) {
        const date = `${m[3]}-${m[2]}-${m[1]}`;
        if (date !== TARGET) continue;
        const hours = Number(m[7]) + Number(m[8]) / 60;
        rows.push({ name, initials, type: m[4], in: m[5], out: m[6], hours });
    }
    while ((m = bajaRe.exec(text))) {
        const date = `${m[3]}-${m[2]}-${m[1]}`;
        if (date !== TARGET) continue;
        const hours = Number(m[4]) + Number(m[5]) / 60;
        rows.push({ name, initials, type: 'Baja', in: '—', out: '—', hours });
    }
    return rows;
}

const downloads = 'c:/Users/hhect/Downloads';
const all: Row[] = [];
for (const file of PDFS) {
    all.push(...(await parseEmployee(downloads, file)));
}

all.sort((a, b) => a.in.localeCompare(b.in));

console.log(`=== ${TARGET} (lunes) ===\n`);
console.log(`Total en barra: ${all.filter((r) => r.type.toLowerCase() !== 'baja').length} trabajando\n`);

const morningExclusive = 13 * 60;
function toMin(hm: string): number {
    if (hm === '—') return 9999;
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

const mañana = all.filter((r) => r.type.toLowerCase() !== 'baja' && toMin(r.in) < morningExclusive);
const tarde = all.filter((r) => r.type.toLowerCase() !== 'baja' && toMin(r.in) >= morningExclusive);

console.log('MAÑANA (entrada antes de 13:00):');
for (const r of mañana) {
    const ok = ['pere', 'alba'].includes(r.name.split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''));
    console.log(`  ${r.initials} ${r.name}: ${r.in}–${r.out} (${r.hours.toFixed(2)} h)${ok ? ' ✓ permitido' : ' ⚠ no debería entrar antes de 13:00'}`);
}

console.log('\nTARDE (entrada desde 13:00):');
for (const r of tarde) {
    console.log(`  ${r.initials} ${r.name}: ${r.in}–${r.out} (${r.hours.toFixed(2)} h)`);
}

const bajas = all.filter((r) => r.type.toLowerCase() === 'baja');
if (bajas.length) {
    console.log('\nBAJAS:');
    for (const r of bajas) console.log(`  ${r.initials} ${r.name}: ${r.hours} h`);
}

const notWorkingNames: string[] = [];
for (const file of PDFS) {
    const rows = await parseEmployee(downloads, file);
    if (rows.length === 0) {
        const text = await parsePdf(fs.readFileSync(path.join(downloads, file)));
        const nameMatch = text.match(/Empleado:\s*\r?\n([^\r\n]+?)\s{2,}DNI/i)
            ?? text.match(/Empleado:\s*([^\r\n]+?)\s{2,}DNI/i);
        notWorkingNames.push((nameMatch?.[1] ?? file).trim());
    }
}
console.log(`\nSin turno ese día (${notWorkingNames.length}):`);
for (const n of notWorkingNames) console.log(`  - ${n}`);
