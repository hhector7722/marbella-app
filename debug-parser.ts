import { readFileSync } from 'fs';
import { parseCompanySummaryPdfBuffer } from './src/lib/payroll/company-summary-parser.ts';

async function main() {
  console.log("=== JULY ===");
  try {
    const buf = readFileSync('./imports/payroll-history/Costes de empresa El Fogo Torrat julio.pdf');
    const res = await parseCompanySummaryPdfBuffer(buf, 'julio.pdf', 'test');
    console.log("Settlements:", res.settlements.length);
    console.log("Total Workers header:", res.header.totalWorkers);
    console.log("Worker names:", res.settlements.map(s => s.employeeName));
  } catch (e) {
    console.error("July Error:", e.message);
    if (e.snapshot) {
      console.log("Extracted Settlements:", e.snapshot.settlements.length);
      console.log("Extracted Worker Names:", e.snapshot.settlements.map(s => s.employeeName));
      console.log("Extracted Total Workers:", e.snapshot.header.totalWorkers);
    }
  }

  console.log("\n=== JUNE ===");
  try {
    const buf = readFileSync('./imports/payroll-history/Costes de empresa El Fogo Torrat junio.pdf');
    const res = await parseCompanySummaryPdfBuffer(buf, 'junio.pdf', 'test');
    console.log("Settlements:", res.settlements.length);
  } catch (e) {
    console.error("June Error:", e.message);
    if (e.snapshot) {
      console.log("Extracted Settlements:", e.snapshot.settlements.length);
      console.log("Extracted Worker Names:", e.snapshot.settlements.map(s => s.employeeName));
      console.log("Extracted Total Workers:", e.snapshot.header.totalWorkers);
    }
  }
}
main();
