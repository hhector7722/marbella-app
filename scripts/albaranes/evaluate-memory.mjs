import { readFile } from 'node:fs/promises'
import { assessDocument } from '../../src/lib/albaranes/pipeline/assess.ts'
import { buildSupplierMemory } from '../../src/lib/albaranes/pipeline/memory.ts'

const source = JSON.parse(await readFile(process.env.MARBELLA_MEMORY_SNAPSHOT || '/tmp/marbella-mapping-snapshots.json', 'utf8'))
const benchmark = JSON.parse(await readFile(process.env.MARBELLA_BENCHMARK_RESULT || 'tmp/mistral-shadow-benchmark.json', 'utf8'))
const invoiceById = new Map(source.invoices.map((invoice) => [invoice.id, invoice]))
const memory = buildSupplierMemory(source)
const suppliers = []
for (const result of benchmark.results) {
  if (result.supplier === 'Otros reintentos') continue
  const supplierId = invoiceById.get(result.invoiceId)?.supplier_id
  if (supplierId == null) continue
  const stats = { supplier: result.supplier, lines: 0, matched: 0, trusted: 0,
    ready: 0, ambiguous: 0, unmatched: 0 }
  const assessment = assessDocument({ document: result.canonical, supplierId,
    memory: memory.identities, presentations: memory.presentations })
  for (const line of assessment.lines) {
    if (line.observedQuantity == null) continue
    stats.lines++
    if (line.ingredientId) stats.matched++
    if (line.mappingVersionId) stats.trusted++
    if (line.status === 'ready_for_review') stats.ready++
    if (line.matchSource === 'ambiguous') stats.ambiguous++
    if (line.matchSource === 'unmatched') stats.unmatched++
  }
  suppliers.push(stats)
}
console.log(suppliers)
console.log(suppliers.reduce((total, row) => {
  for (const key of ['lines', 'matched', 'trusted', 'ready', 'ambiguous', 'unmatched']) total[key] += row[key]
  return total
}, { lines: 0, matched: 0, trusted: 0, ready: 0, ambiguous: 0, unmatched: 0 }))
