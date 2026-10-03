import { mkdir, readFile, writeFile } from 'node:fs/promises'

const baseUrl = process.env.MARBELLA_BENCHMARK_URL
  || 'https://marbella-app-hhector7722s-projects.vercel.app'
const secret = process.env.CRON_SECRET
if (!secret) throw new Error('CRON_SECRET no configurado')

// Muestra de producción: proveedores distintos, tablas ausentes, filas
// colapsadas, varias tablas y documentos que agotaron reintentos Docling.
const sample = [
  ['3efd2aac-8c96-4363-b5b2-5b0d20ed89a1', 'Abril', 0, 9],
  ['beed288e-2df8-4ebb-afc2-0100f7d2cb6a', 'Videla', 7, 3],
  ['97589c1f-63b3-4da1-8f62-6f44ccc53ff5', 'Nestle', 6, 1],
  ['272eb247-31eb-4696-989f-b34fd2159222', 'Sanilec', 1, 17],
  ['bb5b795a-2e82-4d07-ab96-e3ce403c97be', 'Santa Teresa', 4, 24],
  ['816aacb8-090e-4a2f-a155-4b5d29006037', 'Sant Aniol', 0, 5],
  ['157804bd-54b9-4420-99f7-4f59bbc1d471', 'Fritz Ravich', 10, 8],
  ['33e3e7f4-ca09-4067-a249-e6b37e920fce', 'Shers', 5, 6],
  ['34c8d80b-3fc3-48d7-8a4b-34fe92516283', 'Hielo Fenix', 4, 3],
  ['11b4ffb7-3134-4f6d-aa7b-bc9dfb0e9835', 'Ametller', 25, 17],
  ['b057dee4-6f97-45c2-acb7-5a32dce6215c', 'Panabad', 18, 4],
  ['20fc36eb-cd2b-4d08-8bc9-2feab7811fa7', 'Panabad fallo OCR', 0, 0],
  ['76a36e62-643c-4cb3-aae8-47f29f18e420', 'Otros reintentos', 0, 0],
]

const outputPath = process.env.MARBELLA_BENCHMARK_OUTPUT || 'tmp/mistral-shadow-benchmark.json'
const selected = new Set((process.env.MARBELLA_BENCHMARK_IDS || '').split(',').filter(Boolean))
await mkdir('tmp', { recursive: true })
let results = []
try {
  const previous = JSON.parse(await readFile(outputPath, 'utf8'))
  results = Array.isArray(previous.results) ? previous.results : []
} catch { /* Primera ejecución. */ }

for (const [invoiceId, supplier, doclingRows, existingLines] of sample) {
  if (selected.size > 0 && !selected.has(invoiceId)) continue
  if (results.some((item) => item.invoiceId === invoiceId && !item.error)) continue
  const started = Date.now()
  try {
    const response = await fetch(`${baseUrl}/api/internal/albaranes/mistral-shadow`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ invoiceId }),
      signal: AbortSignal.timeout(150_000),
    })
    const body = await response.json()
    if (!response.ok || !body.ok) throw new Error(`${response.status}: ${String(body.error || 'error')}`)
    const lines = Array.isArray(body.canonical?.lines) ? body.canonical.lines : []
    const result = {
      invoiceId, supplier, doclingRows, existingLines,
      mistralLines: lines.length,
      linesWithDescription: lines.filter((line) => line.description_raw).length,
      linesWithQuantity: lines.filter((line) => line.quantity_raw).length,
      linesWithPrice: lines.filter((line) => line.unit_price_raw).length,
      linesWithTotal: lines.filter((line) => line.line_total_raw).length,
      extractionId: body.extractionId,
      cached: body.cached,
      model: body.model,
      elapsedMs: body.metrics?.elapsed_ms,
      requestMs: Date.now() - started,
      canonical: body.canonical,
    }
    results = results.filter((item) => item.invoiceId !== invoiceId)
    results.push(result)
    console.log(`${supplier}: ${lines.length} líneas Mistral; ${doclingRows} filas Docling; ${existingLines} líneas existentes`)
  } catch (error) {
    results = results.filter((item) => item.invoiceId !== invoiceId)
    results.push({ invoiceId, supplier, doclingRows, existingLines,
      error: error instanceof Error ? error.message : 'error inesperado' })
    console.log(`${supplier}: error de prueba`)
  }
  await writeFile(outputPath, JSON.stringify({
    createdAt: new Date().toISOString(), baseUrl, results,
  }, null, 2))
}

console.log('Resultados detallados guardados en tmp/mistral-shadow-benchmark.json')
