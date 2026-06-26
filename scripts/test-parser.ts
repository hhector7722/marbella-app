// scripts/test-parser.ts
// ------------------------------------------------------------
// PoC: Parser de PDFs del pabellón (versión Gemini Vision OCR).
// ------------------------------------------------------------
//
// Uso:
//   npx tsx scripts/test-parser.ts ./public/examples/27-06-26-DS.pdf
// ------------------------------------------------------------

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { parsePdf } from '../src/lib/pavilion/parser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// Carga de variables de entorno desde .env.local
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
// Main
// ------------------------------------------------------------
async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('Uso: npx ts-node scripts/test-parser.ts <ruta/al/pdf>');
    process.exit(1);
  }
  if (!fs.existsSync(pdfPath)) {
    console.error(`Archivo no encontrado: ${pdfPath}`);
    process.exit(1);
  }

  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  const filename = path.basename(pdfPath);

  const pdfSizeMB = Buffer.byteLength(pdfBase64, 'base64') / (1024 * 1024);
  console.log(`📄 PDF: ${filename} (${pdfSizeMB.toFixed(1)} MB)`);

  if (pdfSizeMB > 10) {
    console.error('El PDF supera els 10 MB. Gemini pot rebutjar-lo.');
    process.exit(1);
  }

  console.log('🔍 Enviant a Gemini Vision OCR...');
  const result = await parsePdf(pdfBase64, filename);
  console.log(`✅ Gemini ha retornat ${result.occupations.length} ocupacions`);

  // Salida JSON
  console.log(JSON.stringify(result.occupations, null, 2));
}

main().catch((err) => {
  console.error('❌ Error al procesar el PDF:', err);
  process.exit(1);
});
