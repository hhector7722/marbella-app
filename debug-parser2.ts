import { readFileSync } from 'fs';
import { parseCompanySummaryPdfBuffer } from './src/lib/payroll/company-summary-parser.ts';

async function main() {
  console.log("=== JULY ===");
  const buf = readFileSync('./imports/payroll-history/Costes de empresa El Fogo Torrat julio.pdf');
  const res = await parseCompanySummaryPdfBuffer(buf, { filename: 'julio.pdf', source: 'test' });
  
  if (res.ok) {
    console.log("Settlements:", res.snapshot.settlements.length);
    console.log("Total Workers header:", res.snapshot.header.totalWorkers);
    console.log("Worker names:", res.snapshot.settlements.map(s => s.employeeName));
    console.log("Company Costs:", res.snapshot.settlements.map(s => s.companyCost));
  } else {
    console.log("Parse failed:", res.error);
    console.log("Messages:", res.validationMessages);
  }

  console.log("\n=== JUNE ===");
  const buf2 = readFileSync('./imports/payroll-history/Costes de empresa El Fogo Torrat junio.pdf');
  const res2 = await parseCompanySummaryPdfBuffer(buf2, { filename: 'junio.pdf', source: 'test' });
  
  if (res2.ok) {
    console.log("Settlements:", res2.snapshot.settlements.length);
    console.log("Total Workers header:", res2.snapshot.header.totalWorkers);
    console.log("Worker names:", res2.snapshot.settlements.map(s => s.employeeName));
    console.log("Company Costs:", res2.snapshot.settlements.map(s => s.companyCost));
  } else {
    console.log("Parse failed:", res2.error);
    console.log("Messages:", res2.validationMessages);
  }
}
main();
