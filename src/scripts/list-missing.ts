import { readFileSync } from 'fs';
import path from 'path';
import { parseCompanySummaryPdfBuffer } from '../lib/payroll/company-summary-parser.ts';

const files = [
  'Costes de empresa El Fogo Torrat marzo.pdf',
  'Costes de emrpesa El Fogo Torrat abril.pdf',
  'Costes de emrpesa El Fogo Torrat mayo.pdf'
];

async function main() {
  for (const f of files) {
    const p = path.join(process.cwd(), 'imports/payroll-history', f);
    try {
      const buf = readFileSync(p);
      const res = await parseCompanySummaryPdfBuffer(buf, f, 'test');
      if (res.ok) {
        console.log(`\n=== ${f} ===`);
        res.snapshot.settlements.forEach(s => {
          // List of workers we know failed
          const failed = ['VALIENTE BLANCO SILVIA', 'BOLADERES VILA PERE', 'GUTIERREZ HERNAN DAVID', 'ALVEZ DE OLIVERA JUAN JESUS', 'RODERO PEREZ', 'GUILLEM RUIZ HOMET', 'LARRIPA HUGO RUBIO', 'ACOSTA PAU GUIRIGUET', 'ESTEVE ORELL MARTI', 'MAMADOU NYANDAYE'];
          if (failed.some(name => s.employeeName.includes(name))) {
            console.log(`- ${s.employeeName.padEnd(30, ' ')} | Coste: ${s.companyCost.toFixed(2)} €`);
          }
        });
      } else {
        console.log(`Error en ${f}: ${res.error}`);
      }
    } catch (e) {
      console.log(`Excepcion en ${f}:`, e);
    }
  }
}
main();
