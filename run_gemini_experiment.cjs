const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://feqjbwxkelpgzsdiphei.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    // read it from .env.local or fallback
  }

  const supabase = createClient(supabaseUrl, supabaseKey || "dummy"); // will need the real key

  // Get real key by reading .env.local
  const envContent = fs.readFileSync('/home/hector/Projects/marbella-app/.env.local', 'utf-8');
  let realKey = null;
  let geminiKey = null;
  for (const line of envContent.split('\n')) {
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) realKey = line.split('=')[1];
    if (line.startsWith('GEMINI_API_KEY=')) geminiKey = line.split('=')[1];
  }

  const sb = createClient(supabaseUrl, realKey);

  const pgClient = new Client({ connectionString: 'postgresql://postgres.feqjbwxkelpgzsdiphei:heyJUDE_5_!!@aws-1-eu-west-1.pooler.supabase.com:6543/postgres' });
  await pgClient.connect();
  const res = await pgClient.query(`
    SELECT inv.id, inv.supplier_id, s.name as supplier, inv.file_path
    FROM purchase_invoices inv
    JOIN suppliers s ON s.id = inv.supplier_id
    WHERE inv.file_path IS NOT NULL
    ORDER BY inv.created_at DESC
    LIMIT 100
  `);
  
  const suppliersSeen = new Set();
  const selected = [];
  for (const row of res.rows) {
     if (selected.length >= 10) break;
     if (!suppliersSeen.has(row.supplier_id) || selected.length > 5) {
        suppliersSeen.add(row.supplier_id);
        selected.push(row);
     }
  }

  const results = [];

  for (const doc of selected) {
    console.log("Processing", doc.supplier, doc.file_path);
    const { data, error } = await sb.storage.from('albaranes').download(doc.file_path);
    if (error || !data) {
       console.log("Failed to download", error);
       continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = 'image/jpeg'; // assume jpeg for now

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const geminiPrompt = `
Eres un transcriptor de documentos. Tu único objetivo es extraer la tabla de artículos de este albarán o factura.
NO INTERPRETES. NO DEDUZCAS. NO INFIERAS.
Devuelve EXACTAMENTE la estructura tabular literal que aparece en el papel.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura:
{
  "columnas": ["nombre de columna 1", "nombre de columna 2", "..."],
  "filas": [
    {
      "nombre de columna 1": "valor literal transcrito de la celda",
      "nombre de columna 2": "valor literal transcrito de la celda"
    }
  ]
}

Reglas:
- Extrae los nombres de las columnas exactamente como aparecen en el encabezado de la tabla (ej: "DESCRIPCIÓN", "CAJAS", "UDS", "PRECIO", "IMPORTE").
- Extrae los valores exactamente como están escritos.
- Si una columna no tiene nombre en el papel, ponle "COLUMNA_SIN_NOMBRE_1".
- No inventes columnas como "quantity" o "unit" si no están.
- Solo debes incluir las líneas de artículos, ignora el resto del documento.
`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
            parts: [{ text: geminiPrompt }, { inline_data: { mime_type: mimeType, data: base64 } }],
        }],
        generationConfig: { response_mime_type: 'application/json' },
      }),
    });

    if (!geminiRes.ok) {
       console.log("Gemini failed", await geminiRes.text());
       continue;
    }

    const json = await geminiRes.json();
    let text = json.candidates[0].content.parts[0].text;
    results.push({
      supplier: doc.supplier,
      file: doc.file_path,
      transcription: JSON.parse(text)
    });
  }

  fs.writeFileSync('experiment_results.json', JSON.stringify(results, null, 2));
  console.log("Done");
  await pgClient.end();
}

run().catch(console.error);
