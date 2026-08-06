import { readFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { parseCompanySummaryPdfBuffer } from '../lib/payroll/company-summary-parser.ts';
import { PayrollEmployeeNormalizer } from '../lib/payroll/payroll-employee-normalizer.ts';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MONTHS: Record<string, string> = {
  '2026-03': 'marzo.pdf',
  '2026-04': 'abril.pdf',
  '2026-05': 'mayo.pdf',
};

async function main() {
  const normalizer = new PayrollEmployeeNormalizer(supabase);
  await normalizer.initialize();

  for (const [period, filename] of Object.entries(MONTHS)) {
    const p = filename.includes('abril') || filename.includes('mayo') 
        ? `Costes de emrpesa El Fogo Torrat ${filename}` 
        : `Costes de empresa El Fogo Torrat ${filename}`;
    const filePath = path.join(process.cwd(), 'imports/payroll-history', p);
    
    try {
      const buffer = readFileSync(filePath);
      const snapshot = await parseCompanySummaryPdfBuffer(buffer, filename, 'backfill');
      
      console.log(`\n=== PERIODO: ${period} ===`);
      let totalMissingCost = 0;
      
      for (const settlement of snapshot.settlements) {
        const match = normalizer.matchCandidate({
          dni: settlement.employeeCode,
          name: settlement.employeeName,
        });
        
        if (!match.matched || !match.userId) {
          console.log(`- ${settlement.employeeName.padEnd(30, ' ')} | Coste: ${settlement.companyCost.toFixed(2)} € | Razón: ${match.errorMessage}`);
          totalMissingCost += settlement.companyCost;
        }
      }
      
      console.log(`TOTAL COSTE OMITIDO EN ${period}: ${totalMissingCost.toFixed(2)} €`);
    } catch (e: any) {
      console.log(`Error leyendo ${period}: ${e.message}`);
    }
  }
}

main().catch(console.error);
