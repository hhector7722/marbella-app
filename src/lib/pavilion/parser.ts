// src/lib/pavilion/parser.ts
// ------------------------------------------------------------
// Parser de PDFs del pabellón usando Gemini Vision OCR.
// Reutiliza el mismo patrón de Gemini que el scanner de albaranes
// y el importador de recetas de la aplicación.
// ------------------------------------------------------------
//
// Uso:
//   const { occupations } = await parsePdfFromFile('ruta/al.pdf');
//   const { occupations } = await parsePdf(pdfBase64, '27-06-26-DS.pdf');
//
// Devuelve:
//   [{ activity, start_time, end_time, venues[], date }]
// ------------------------------------------------------------

export interface Occupation {
  activity: string;
  start_time: string;
  end_time: string;
  venues: string[];
  date: string;
}

export interface ParsePdfResult {
  occupations: Occupation[];
  date: string;
}

interface GeminiContentPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface GeminiOccupationsResult {
  date: string;
  occupations: Array<Omit<Occupation, 'date'>>;
}

const GEMINI_MODEL = 'gemini-2.5-flash';

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY no configurada. Añádela a .env.local',
    );
  }
  return key;
}

function extractDateFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const match = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [_, dd, mm, yy] = match;
  const yyyy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
  return `${yyyy}-${mm}-${dd}`;
}

async function callGeminiOcr(
  pdfBase64: string,
): Promise<GeminiOccupationsResult> {
  const apiKey = getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

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
3. end_time és l'hora en què ACABA l'activitat (no l'inici de la següent).
4. No inventis activitats. Només extreu el que veus al PDF.
5. Respecta els noms originals de les activitats (en català).
6. IMPORTANT: El camp "activity" ha de contenir NOMÉS el nom de l'activitat, sense números, codis ni parèntesis numèrics al davant (ex: si veus "8287 KRAV MAGA" o "(8287) KRAV MAGA", posa "KRAV MAGA"). Elimina qualsevol número o codi que precedeixi el nom.
7. Si no trobes la data al document, posa "date": "".`;

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

  const geminiData: GeminiResponse = await res.json();
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

/**
 * Parsea un PDF desde una ruta de archivo.
 * Lee el archivo, lo envía a Gemini Vision OCR y devuelve las ocupaciones.
 */
export async function parsePdfFromFile(pdfPath: string): Promise<ParsePdfResult> {
  const fs = await import('fs');
  const path = await import('path');
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  const filename = path.basename(pdfPath);
  return parsePdf(pdfBase64, filename);
}

/**
 * Parsea un PDF desde base64.
 * @param pdfBase64 - Contenido del PDF en base64
 * @param filename - Nombre del archivo (opcional, para extraer fecha)
 */
export async function parsePdf(
  pdfBase64: string,
  filename?: string,
): Promise<ParsePdfResult> {
  const result = await callGeminiOcr(pdfBase64);

  // La fecha del nombre del archivo tiene prioridad sobre la que extraiga Gemini.
  const filenameDate = extractDateFromFilename(filename);
  const resolvedDate = filenameDate || result.date;

  const occupations: Occupation[] = result.occupations.map((occ) => ({
    ...occ,
    date: resolvedDate,
  }));

  return {
    occupations,
    date: resolvedDate,
  };
}
