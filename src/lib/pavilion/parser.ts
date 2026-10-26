// src/lib/pavilion/parser.ts
// ------------------------------------------------------------
// Parser de PDFs del pabellón usando Mistral Document QnA.
// El PDF contiene una cuadrícula rasterizada: necesitamos comprensión
// visual/documental, no solo OCR de texto.
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
  warnings: string[];
}

interface MistralOccupationsResult {
  date: string;
  occupations: Array<Omit<Occupation, 'date'>>;
  warnings: string[];
}

interface MistralChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const MISTRAL_MODEL = 'mistral-medium-3-5';
const MISTRAL_CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';
const MAX_REASONABLE_OCCUPATIONS = 120;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

function cleanActivityName(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:\(\s*\d+\s*\)|\[\s*\d+\s*\]|\d+)\s*[-.:)]?\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getChatContent(data: MistralChatResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
  }

  throw new Error('Mistral no devolvió contenido en la respuesta.');
}

function parseAndValidateResult(raw: string): MistralOccupationsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`JSON inválido de Mistral: ${raw.slice(0, 1000)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Mistral devolvió un objeto vacío o inválido.');
  }

  const candidate = parsed as {
    date?: unknown;
    occupations?: unknown;
  };

  if (!Array.isArray(candidate.occupations)) {
    throw new Error('Mistral no devolvió el array "occupations".');
  }

  if (candidate.occupations.length > MAX_REASONABLE_OCCUPATIONS) {
    throw new Error(
      `Extracción sospechosa: ${candidate.occupations.length} ocupaciones (máximo permitido ${MAX_REASONABLE_OCCUPATIONS}).`,
    );
  }

  const deduped = new Map<string, Omit<Occupation, 'date'>>();
  const warnings: string[] = [];

  candidate.occupations.forEach((item, index) => {
    // Mistral puede incluir una celda gris o vacía como fila.
    // Nunca dejamos que una de estas filas anule todas las ocupaciones válidas.
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`Fila ${index + 1}: objeto inválido; requiere revisión.`);
      return;
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
      warnings.push(`Fila ${index + 1}: campos incompletos; requiere revisión.`);
      return;
    }

    const activity = cleanActivityName(row.activity);
    const startTime = row.start_time.trim();
    const endTime = row.end_time.trim();
    const venues = [...new Set(
      row.venues.map((venue) => venue.trim().toUpperCase()).filter(Boolean),
    )].sort();

    if (!activity) {
      warnings.push(`Fila ${index + 1}: nombre vacío; requiere revisión.`);
      return;
    }
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime) || startTime >= endTime) {
      warnings.push(`Fila ${index + 1}: horario inválido; requiere revisión.`);
      return;
    }
    if (venues.length === 0) {
      warnings.push(`Fila ${index + 1}: sin espacio; requiere revisión.`);
      return;
    }

    const key = [
      activity.toLocaleUpperCase('ca-ES'),
      startTime,
      endTime,
      venues.join('|'),
    ].join('::');

    deduped.set(key, {
      activity,
      start_time: startTime,
      end_time: endTime,
      venues,
    });
  });

  return {
    date: typeof candidate.date === 'string' ? candidate.date.trim() : '',
    occupations: [...deduped.values()],
    warnings,
  };
}

async function callMistralDocumentQna(
  pdfBase64: string,
  secondPass = false,
): Promise<MistralOccupationsResult> {
  const apiKey = getMistralKey();

  const prompt = `Analitza visualment aquest PDF "Plantilla d'Ocupació del Recurs" del CEM La Mar Bella.

IMPORTANT: la graella principal és una IMATGE dins del PDF. No et limitis al text OCR del títol: has d'interpretar visualment tota la graella.

ESTRUCTURA:
- Cada COLUMNA és un espai/recurs. El nom de l'espai és la capçalera superior de la columna (P1, P2, P3, P4, PEX, TATAMI, ANTIC MODUL, NOU MODUL, TERR, GESPA, GESPA P, FORM-ATLE, ATL, ATL P, ANNEX, FOTO, OBS, OBS2, o la capçalera que aparegui realment).
- Cada FILA representa una franja horària, normalment en intervals de 30 minuts.
- Els blocs de color amb text són ocupacions. Les cel·les grises o buides NO són activitats.
- Un bloc vertical que cobreix diverses franges representa UNA sola ocupació desde la seva hora inicial fins a la seva hora final.
- No generis una ocupació por cada cel·la de 30 minuts.
- Si exactament la mateixa activitat ocupa diversos espais simultàniament amb la mateixa hora inicial i final, retorna UNA sola ocupació amb tots aquests espais en venues.
- venues ha de contenir EXCLUSIVAMENT noms de capçaleres de columna que existeixin al document; mai noms d'activitats.

EXTREU totes les ocupacions reals que apareixen a la graella, ni més ni menys.

NETEJA DEL NOM:
- Elimina només el codi numèric inicial entre parèntesis o delante del nombre.
- Conserva el resto del nombre tal como aparece.
- Exemple: "(8287) KRAV MAGA" -> "KRAV MAGA".

Retorna EXCLUSIVAMENT JSON vàlid:
{
  "date": "YYYY-MM-DD",
  "occupations": [
    {
      "activity": "string",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "venues": ["P1"]
    }
  ]
}

REGLES CRÍTIQUES:
1. No inventis activitats, espais ni hores.
2. No converteixis textos de capçalera en activitats.
3. No fragmentis un bloc continu en múltiples files horàries.
4. start_time i end_time han de reflectir els límits visuals del bloc.
5. Si un bloc acaba a 23:59, usa "23:59".
6. Si no pots determinar alguna ocupació amb prou certesa, omet-la abans d'inventar-la.
7. No afegeixis explicacions, markdown ni camps extra.
8. No retornis mai una fila amb activity buit, sense horari o sense espai.
9. Si de debò no hi ha ocupacions reals, retorna occupations: [] sense inventar res.`;

  const secondPassInstructions = secondPass
    ? '\\n\\nSEGONA LECTURA VISUAL: La primera lectura no ha trobat cap ocupació vàlida. Revisa amb especial atenció TOTES les columnes, els blocs verticals de color i les franges horàries. Si hi ha text llegible dins un bloc ocupat, extreu-lo. No inventis dades. Si la graella és buida, retorna occupations: [].'
    : '';

  const res = await fetch(MISTRAL_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt + secondPassInstructions },
            {
              type: 'document_url',
              document_url: `data:application/pdf;base64,${pdfBase64}`,
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      random_seed: 0,
      max_tokens: 12000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Mistral Document QnA error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as MistralChatResponse;
  return parseAndValidateResult(getChatContent(data));
}

/**
 * Parsea un PDF desde una ruta de archivo.
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
 */
export async function parsePdf(
  pdfBase64: string,
  filename?: string,
): Promise<ParsePdfResult> {
  let result = await callMistralDocumentQna(pdfBase64);

  // Segunda lectura visual solo si el primer resultado quedó completamente
  // vacío. Nunca aceptamos cero ocupaciones como una importación correcta.
  if (result.occupations.length === 0) {
    const second = await callMistralDocumentQna(pdfBase64, true);
    result = {
      ...second,
      warnings: [...result.warnings, ...second.warnings],
    };
  }

  // La fecha del nombre del archivo es la fuente autoritativa cuando existe.
  const filenameDate = extractDateFromFilename(filename);
  const resolvedDate = filenameDate || result.date;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
    throw new Error(`No se pudo resolver una fecha válida para ${filename ?? 'el PDF'}.`);
  }

  const occupations: Occupation[] = result.occupations.map((occ) => ({
    ...occ,
    date: resolvedDate,
  }));

  return {
    occupations,
    date: resolvedDate,
    warnings: result.warnings,
  };
}
