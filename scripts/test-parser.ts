// scripts/test-parser.ts
// ------------------------------------------------------------
// PoC: Parser de PDFs del pabellón (versión Gemini Vision OCR).
// ------------------------------------------------------------
//
// Esta herramienta es una prueba de concepto que **no** toca Supabase.
// Recibe la ruta a un PDF escaneado, lo envía a Gemini Vision API
// (el mismo OCR que ya usa la aplicación) y devuelve un JSON con
// la lista de ocupaciones:
//   [{ activity, start_time, end_time, venues, date }]
//
// Uso:
//   npx ts-node scripts/test-parser.ts ./public/examples/27-06-26-DS.pdf
// ------------------------------------------------------------

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

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
// Tipos de salida
// ------------------------------------------------------------
interface Occupation {
  activity: string;
  start_time: string;
  end_time: string;
  venues: string[];
  date: string;
}

interface GeminiOccupationsResult {
  date: string;
  occupations: Omit<Occupation, 'date'>[];
}

// ------------------------------------------------------------
// Llamada a Gemini Vision API (reutilizando el patrón existente
// en src/app/dashboard/scanner/actions.ts y
// src/app/dashboard/recetas-import/actions.ts)
// ------------------------------------------------------------
async function extractOccupationsWithGemini(
  pdfBase64: string,
): Promise<GeminiOccupationsResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY no configurada. Comprueba que existe en .env.local',
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `Ets un sistema d'OCR especialitzat en documents esportius.

Analitza aquest PDF d'una "Plantilla d'Ocupació del Recurs" del CEM La Mar Bella.

El document conté una graella d'ocupacions on:
- Les COLUMNES són els recursos/espais (P1, P2, P3, P4, Sala 1, Sala 2, Exterior, Pista Polivalent, etc.)
- Les FILES són les franges horàries (normalment de 08:00 a 23:00, intervals d'1 hora)
- Cada CEL·LA conté el nom de l'activitat que ocupa aquell espai en aquella franja

EXTRATU TOTES les ocupacions. No te'n deixis cap.

Torna un JSON amb aquesta estructura exacta (respon només el JSON, sense markdown ni explicacions):

{
  "date": "YYYY-MM-DD",
  "occupations": [
    {
      "activity": "string",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "venues": ["string"]
    }
  ]
}

REGLES IMPORTANTS:
1. Si una activitat ocupa diverses franges consecutives al MATEIX espai → una sola ocupació amb start_time i end_time.
2. Si una activitat ocupa diversos espais a la vegada (mateixa franja) → tots els venues a la llista.
3. end_time és l'hora en què ACABA l'activitat.
4. No inventis activitats. Només extreu el que veus al PDF.
5. Respecta els noms originals de les activitats (en català).
6. Si no trobes la data al document, posa "date": "".`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          ],
        },
      ],
      generationConfig: { response_mime_type: 'application/json' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const geminiData = await res.json();
  const rawText =
    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Gemini no retornà text');
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`JSON invàlid de Gemini:\n${rawText}`);
  }
}

// ------------------------------------------------------------
// Main – procesa el PDF y escribe el JSON en stdout.
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

  // Leer PDF como base64
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  const pdfSizeMB = Buffer.byteLength(pdfBase64, 'base64') / (1024 * 1024);
  console.log(`📄 PDF: ${path.basename(pdfPath)} (${pdfSizeMB.toFixed(1)} MB)`);

  if (pdfSizeMB > 10) {
    console.error('El PDF supera els 10 MB. Gemini pot rebutjar-lo.');
    process.exit(1);
  }

  // Enviar a Gemini Vision OCR
  console.log('🔍 Enviant a Gemini Vision OCR...');
  const result = await extractOccupationsWithGemini(pdfBase64);
  console.log(`✅ Gemini ha retornat ${result.occupations.length} ocupacions`);

  // La fecha del PDF se extrae del nombre del archivo (formato DD-MM-YY)
  // y sobreescribe la que ha podido extraer Gemini del documento.
  const filename = path.basename(process.argv[2]);
  const dateMatch = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [_, dd, mm, yy] = dateMatch;
    const yyyy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
    const isoDate = `${yyyy}-${mm}-${dd}`;
    result.date = isoDate;
  }

  // Construir ocupaciones con fecha
  const occupations: Occupation[] = result.occupations.map((occ) => ({
    ...occ,
    date: result.date,
  }));

  // Salida JSON formateada
  console.log(JSON.stringify(occupations, null, 2));
}

main().catch((err) => {
  console.error('❌ Error al procesar el PDF:', err);
  process.exit(1);
});
