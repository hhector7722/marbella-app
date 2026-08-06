import fs from 'node:fs/promises';
import { parseCompanySummaryPdfBuffer } from './src/lib/payroll/company-summary-parser.ts';

async function main() {
  const buf = await fs.readFile('./imports/payroll-history/Costes de empresa El Fogo Torrat junio.pdf');
  const res = await parseCompanySummaryPdfBuffer(buf, { filename: 'junio.pdf' });
  
  if (res.ok) {
    console.log("=== JUNE ===");
    console.log("Total Workers header:", res.snapshot.header.totalWorkers);
    console.log("Settlements:", res.snapshot.settlements.length);
    res.snapshot.settlements.forEach(s => {
      console.log(`- ${s.employeeName} (${s.classification})`);
    });
  } else {
    console.log("Failed:", res);
  }
}
main();
