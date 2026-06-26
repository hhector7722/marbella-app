// scripts/import-parser.ts
// ------------------------------------------------------------
// Importador de PDFs del pabellón.
//
// Pipeline completo:
//   PDF → Gemini OCR → JSON → activity_occurrences + occurrence_venues
//
// Uso:
//   npx tsx scripts/import-parser.ts ./public/examples/27-06-26-DS.pdf
//
// Después de ejecutar, abrir Supabase y verificar:
//   - activities     → nuevas filas
//   - venues         → nuevas filas
//   - activity_occurrences → nuevas filas
//   - occurrence_venues   → nuevas filas
// ------------------------------------------------------------

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { parsePdf } from '../src/lib/pavilion/parser.ts';
import { importOccupations } from '../src/lib/pavilion/importer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// Carga de variables de entorno
// ------------------------------------------------------------
function loadEnv(): void {
  const envPaths = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

// ------------------------------------------------------------
// Cliente Supabase con service_role
// ------------------------------------------------------------
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Falten NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY a .env.local',
    );
  }
  return createClient(url, key);
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('Uso: npx ts-node scripts/import-parser.ts <ruta/al/pdf>');
    process.exit(1);
  }
  if (!fs.existsSync(pdfPath)) {
    console.error(`Archivo no encontrado: ${pdfPath}`);
    process.exit(1);
  }

  const filename = path.basename(pdfPath);
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  const pdfSizeMB = Buffer.byteLength(pdfBase64, 'base64') / (1024 * 1024);

  console.log('╔══════════════════════════════════════╗');
  console.log('║   IMPORTADOR OCUPACIONS PAVELLÓ     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`📄 PDF: ${filename} (${pdfSizeMB.toFixed(1)} MB)`);

  if (pdfSizeMB > 10) {
    console.error('❌ El PDF supera els 10 MB.');
    process.exit(1);
  }

  // --------------------------------------------------
  // 1. Parser (Gemini OCR)
  // --------------------------------------------------
  console.log('');
  console.log('🔍 [1/3] Analitzant PDF amb Gemini Vision OCR...');
  const result = await parsePdf(pdfBase64, filename);
  console.log(`      → ${result.occupations.length} ocupacions detectades`);
  console.log(`      → Data: ${result.date}`);

  if (result.occupations.length === 0) {
    console.error('❌ No es van detectar ocupacions.');
    process.exit(1);
  }

  // --------------------------------------------------
  // 2. Mostrar resum del parseig
  // --------------------------------------------------
  const uniqueVenues = new Set<string>();
  for (const occ of result.occupations) {
    for (const v of occ.venues) uniqueVenues.add(v);
  }
  console.log(`      → ${uniqueVenues.size} espais/venues diferents`);
  console.log('');

  // --------------------------------------------------
  // 3. Importar a Supabase
  // --------------------------------------------------
  console.log('🔍 [2/3] Connectant a Supabase...');
  const supabase = createServiceClient();
  console.log('      ✅ Connexió establerta');

  console.log('');
  console.log('🔍 [3/3] Important ocupacions...');
  console.log('      (aquest pas elimina les ocupacions prèvies de la mateixa data)');

  const importResult = await importOccupations(supabase, result.occupations);

  // --------------------------------------------------
  // 4. Resultats
  // --------------------------------------------------
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   RESULTAT IMPORTACIÓ               ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`   Data:              ${importResult.date}`);
  console.log(`   Activities creades: ${importResult.activitiesCreated}`);
  console.log(`   Venues creats:      ${importResult.venuesCreated}`);
  console.log(`   Occurrences:        ${importResult.occurrencesInserted}`);
  console.log(`   Occurrence venues:  ${importResult.occurrenceVenuesInserted}`);
  console.log('');

  if (importResult.occurrencesInserted > 0) {
    console.log('✅ IMPORTACIÓ COMPLETADA');
    console.log('');
    console.log('Obre Supabase i verifica:');
    console.log('   - activities');
    console.log('   - venues');
    console.log('   - activity_occurrences');
    console.log('   - occurrence_venues');
  } else {
    console.log('⚠️  No es va insertar cap occurència.');
  }
}

main().catch((err) => {
  console.error('');
  console.error('❌ Error:', err);
  process.exit(1);
});
