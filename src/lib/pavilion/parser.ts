// src/lib/pavilion/parser.ts
// ------------------------------------------------------------
// Parser de PDFs del pabellón usando Mistral Document AI OCR.
// Mantiene el mismo contrato que el parser anterior para no
// modificar el webhook, la revisión ni el importador.
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
  color?: string;
  form_start_time?: string | null;
  form_end_time?: string | null;
  preferred_start_time?: 'pdf' | 'form';
  preferred_end_time?: 'pdf' | 'form';
  total_participants?: number | null;
  occurrence_groups?: { category_id: string; name: string }[];
}

export interface ParsePdfResult {
  occupations: Occupation[];
  date: string;
}

interface MistralOcrResponse {
  document_annotation?: string | MistralOccupationsResult | null;
  model?: string;
}

interface MistralOccupationsResult {
  date: string;
  occupations: Array<Omit<Occupation, 'date'>>;
}

const MISTRAL_OCR_MODEL = 'mistral-ocr-latest';
const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';

function getMistralKey(): string {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    throw new Error(
      'MISTRAL_API_KEY no configurada. Añádela a las variables de entorno.',
    );
  }
  return key;
}

function extractDateFromFilename(filename?: string): string | null {
  if (!filename) return null;
  const match = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, dd, mm, yy] = match;
  const yyyy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function parseMistralAnnotation(raw: string): MistralOccupationsResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`JSON inválido de Mistral:\n${raw}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Mistral devolvió una anotación vacía o inválida.');
  }

  const candidate = parsed as {
    date?: unknown;
    occupations?: unknown;
  };

  if (!Array.isArray(candidate.occupations)) {
    throw new Error('Mistral no devolvió el array "occupations".');
  }

  const occupations = candidate.occupations.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Ocupación inválida en posición ${index}.`);
    }

    const row = item as {
      activity?: unknown;
      start_time?: unknown;
      end_time?: unknown;
      venues?: unknown;
    };

    if (
      typeof row.activity !== 'string' ||
      typeof row.start_time !== 'string' ||
      typeof row.end_time !== 'string' ||
      !Array.isArray(row.venues) ||
      !row.venues.every((venue) => typeof venue === 'string')
    ) {
      throw new Error(`Ocupación incompleta o inválida en posición ${index}.`);
    }

    return {
      activity: row.activity.trim(),
      start_time: row.start_time.trim(),
      end_time: row.end_time.trim(),
      venues: row.venues.map((venue) => venue.trim()).filter(Boolean),
    };
  });

  return {
    date: typeof candidate.date === 'string' ? candidate.date.trim() : '',
    occupations,
  };
}

async function callMistralOcr(
  pdfBase64: string,
): Promise<MistralOccupationsResult> {
  const apiKey = getMistralKey();

  const prompt = `Ets un sistema d'OCR especialitzat en documents esportius.

Analitza aquest PDF d'una "Plantilla d'Ocupació del Recurs" del CEM La Mar Bella.

El document conté una graella d'ocupacions on:
- Les COLUMNES són els recursos/espais (P1, P2, P3, P4, Sala 1, Sala 2, Exterior, Pista Polivalent, etc.)
- Les FILES són les franges horàries (normalment de 08:00 a 23:00, intervals d'1 hora)
- Cada CEL·LA conté el nom de l'activitat que ocupa aquell espai en aquella franja.

EXTREU TOTES les ocupacions. No te'n deixis cap.

Retorna exclusivament un objecte JSON amb aquesta estructura:
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

REGLES:
1. Si una activitat ocupa diverses franges consecutives al mateix espai, retorna una sola ocupació amb start_time i end_time.
2. Si una activitat ocupa diversos espais a la vegada en la mateixa franja, posa tots els espais a venues.
3. end_time és l'hora en què acaba l'activitat.
4. No inventis activitats. Només extreu el que apareix al PDF.
5. Respecta els noms originals de les activitats.
6. El camp activity ha de contenir només el nom de l'activitat, sense números, codis ni parèntesis numèrics al davant. Per exemple, "8287 KRAV MAGA" o "(8287) KRAV MAGA" ha de quedar com "KRAV MAGA".
7. Si no trobes la data al document, retorna "date": "".
8. Les hores han d'estar sempre en format HH:MM de 24 hores.
9. No afegeixis explicacions ni camps extra.`;

  const res = await fetch(MISTRAL_OCR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MISTRAL_OCR_MODEL,
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${pdfBase64}`,
      },
      document_annotation_format: {
        type: 'json_schema',
        json_schema: {
          name: 'pavilion_occupations',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              date: {
                type: 'string',
                description: 'Data del document en format YYYY-MM-DD; cadena buida si no es pot determinar.',
              },
              occupations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    activity: {
                      type: 'string',
                      description: 'Nom de l’activitat sense codis numèrics inicials.',
                    },
                    start_time: {
                      type: 'string',
                      description: 'Hora d’inici en format HH:MM de 24 hores.',
                    },
                    end_time: {
                      type: 'string',
                      description: 'Hora de finalització en format HH:MM de 24 hores.',
                    },
                    venues: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Espais o pistes ocupats simultàniament.',
                    },
                  },
                  required: ['activity', 'start_time', 'end_time', 'venues'],
                },
              },
            },
            required: ['date', 'occupations'],
          },
        },
      },
      document_annotation_prompt: prompt,
      include_image_base64: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Mistral OCR API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as MistralOcrResponse;
  const rawAnnotation = data.document_annotation;

  if (!rawAnnotation) {
    throw new Error('Mistral OCR no devolvió document_annotation.');
  }

  if (typeof rawAnnotation === 'string') {
    return parseMistralAnnotation(rawAnnotation);
  }

  return rawAnnotation;
}

/**
 * Parsea un PDF desde una ruta de archivo.
 * Lee el archivo, lo envía a Mistral Document AI OCR y devuelve las ocupaciones.
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
  const result = await callMistralOcr(pdfBase64);

  // La fecha del nombre del archivo tiene prioridad sobre la extraída por OCR.
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
