/**
 * CLI Evidence-only backfill (piloto).
 *
 * Uso:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/evidence-backfill/run.ts --dry-run --pilot
 *
 *   pnpm dlx tsx scripts/evidence-backfill/run.ts --dry-run --pilot
 *
 * Write (NO ejecutar hasta autorización explícita):
 *   ... --write --i-understand-evidence-only --invoice-id <uuid>
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { processInvoiceEvidenceOnly, createWriteDepsWriter } from '../../src/lib/evidence-backfill/pipeline.ts'
import type { OperativeLineForMatch } from '../../src/lib/evidence-backfill/matcher.ts'
import type { InvoiceHeaderSnapshot } from '../../src/lib/evidence-backfill/types.ts'
import type { EvidenceWriteClient } from '../../src/lib/evidence-backfill/writer.ts'

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('Falta .env.local')
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] ??= val
  }
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run')
  const write = argv.includes('--write')
  const pilot = argv.includes('--pilot')
  const iUnderstand = argv.includes('--i-understand-evidence-only')
  const idIdx = argv.indexOf('--invoice-id')
  const invoiceId = idIdx >= 0 ? String(argv[idIdx + 1] ?? '').trim() : ''
  return { dryRun, write, pilot, iUnderstand, invoiceId }
}

function loadPilotIds(): string[] {
  const p = path.join(process.cwd(), 'scripts/evidence-backfill/pilot-ids.json')
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{ id: string }>
  return raw.map((r) => r.id)
}

function asWriteClient(supabase: SupabaseClient): EvidenceWriteClient {
  return {
    async rpc(fn, args) {
      const { data, error } = await supabase.rpc(fn, args)
      return { data, error: error ? { message: error.message } : null }
    },
    from(table: string) {
      return {
        async insert(rows: unknown) {
          const { data, error } = await supabase.from(table).insert(rows as never)
          return { data, error: error ? { message: error.message } : null }
        },
      }
    },
  }
}

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  if (args.write && args.dryRun) {
    throw new Error('No combinar --dry-run y --write')
  }
  if (!args.write && !args.dryRun) {
    throw new Error('Indica --dry-run (o --write con autorización)')
  }
  if (args.write && !args.iUnderstand) {
    throw new Error('--write requiere --i-understand-evidence-only')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY')
  }

  const mode = args.dryRun ? 'dry-run' : 'write'
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let invoiceIds: string[] = []
  if (args.pilot) {
    invoiceIds = loadPilotIds()
  } else if (args.invoiceId) {
    invoiceIds = [args.invoiceId]
  } else {
    throw new Error('Indica --pilot o --invoice-id <uuid>')
  }

  if (invoiceIds.length === 0) {
    throw new Error('Lista de invoices vacía')
  }

  console.log(JSON.stringify({ event: 'start', mode, count: invoiceIds.length }, null, 2))

  const writer =
    mode === 'write'
      ? createWriteDepsWriter(asWriteClient(supabase), {
          iUnderstandEvidenceOnly: args.iUnderstand,
        })
      : undefined

  // Defensa explícita dry-run
  if (mode === 'dry-run' && writer) {
    throw new Error('SEGURIDAD: writer no debe existir en dry-run')
  }

  const results = []

  for (const invoiceId of invoiceIds) {
    const result = await processInvoiceEvidenceOnly(invoiceId, {
      mode,
      writer,
      async countExtractionsForDocument(id, hash) {
        const { count, error } = await supabase
          .from('document_extractions')
          .select('id', { count: 'exact', head: true })
          .eq('invoice_id', id)
          .eq('file_version_hash', hash)
        if (error) throw new Error(error.message)
        return count ?? 0
      },
      async loadInvoice(id): Promise<InvoiceHeaderSnapshot | null> {
        const { data, error } = await supabase
          .from('purchase_invoices')
          .select(
            'id, invoice_number, invoice_date, total_amount, file_path, content_sha256, source, status, suppliers(name)'
          )
          .eq('id', id)
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) return null
        const row = data as Record<string, unknown>
        const suppliers = row.suppliers as { name?: string } | { name?: string }[] | null
        const supplierName = Array.isArray(suppliers)
          ? suppliers[0]?.name ?? null
          : suppliers?.name ?? null
        return {
          id: String(row.id),
          invoice_number: (row.invoice_number as string | null) ?? null,
          invoice_date: (row.invoice_date as string | null) ?? null,
          total_amount: row.total_amount == null ? null : Number(row.total_amount),
          file_path: (row.file_path as string | null) ?? null,
          content_sha256: (row.content_sha256 as string | null) ?? null,
          source: (row.source as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          supplier_name: supplierName,
        }
      },
      async loadLines(id): Promise<OperativeLineForMatch[]> {
        const { data, error } = await supabase
          .from('purchase_invoice_lines')
          .select(
            'id, original_name, quantity, unit_price, total_price, line_unit, status, ingredients:mapped_ingredient_id(name)'
          )
          .eq('invoice_id', id)
          .order('id', { ascending: true })
        if (error) throw new Error(error.message)
        return (data ?? []).map((r: Record<string, unknown>, orderIndex: number) => {
          const ingredients = r.ingredients as { name?: string } | { name?: string }[] | null
          const ingredientName = Array.isArray(ingredients)
            ? ingredients[0]?.name ?? null
            : ingredients?.name ?? null
          return {
            id: String(r.id),
            original_name: (r.original_name as string | null) ?? null,
            quantity: r.quantity == null ? null : Number(r.quantity),
            unit_price: r.unit_price == null ? null : Number(r.unit_price),
            total_price: r.total_price == null ? null : Number(r.total_price),
            line_unit: (r.line_unit as string | null) ?? null,
            status: (r.status as string | null) ?? null,
            ingredient_name: ingredientName,
            orderIndex,
          }
        })
      },
      async downloadFile(filePath) {
        const { data, error } = await supabase.storage.from('albaranes').download(filePath)
        if (error || !data) {
          return { ok: false as const, message: error?.message ?? 'sin datos storage' }
        }
        const buffer = Buffer.from(await data.arrayBuffer())
        const mimeType = data.type || 'application/octet-stream'
        return {
          ok: true as const,
          mimeType,
          buffer,
          rawBase64: buffer.toString('base64'),
        }
      },
    })

    if (result.writes.length > 0 && mode === 'dry-run') {
      throw new Error(`SEGURIDAD: dry-run produjo writes para ${invoiceId}`)
    }

    results.push(result)
    console.log(
      JSON.stringify(
        {
          event: 'invoice',
          invoice_id: result.invoice_id,
          outcome: result.outcome,
          supplier: result.supplier,
          invoice_date: result.invoice_date,
          mime: result.mime,
          size_bytes: result.size_bytes,
          sha_source: result.sha_source,
          ocr_ok: result.ocr_ok,
          ocr_error: result.ocr_error,
          table_metrics: result.table_metrics,
          operative_line_count: result.operative_line_count,
          matches: result.matcher?.matches.length ?? 0,
          ambiguous: result.matcher?.ambiguous.length ?? 0,
          no_match: result.matcher?.noMatch.length ?? 0,
          provenance_would_create: result.provenance_would_create.length,
          writes: result.writes,
          header_comparison: result.header_comparison,
          errors: result.errors,
          notes: result.notes,
        },
        null,
        2
      )
    )
  }

  const summary = {
    event: 'summary',
    mode,
    total: results.length,
    by_outcome: Object.fromEntries(
      [...new Set(results.map((r) => r.outcome))].map((o) => [
        o,
        results.filter((r) => r.outcome === o).length,
      ])
    ),
    total_writes_entries: results.reduce((n, r) => n + r.writes.length, 0),
    any_writes: results.some((r) => r.writes.length > 0),
  }
  console.log(JSON.stringify(summary, null, 2))

  const outDir = path.join(process.cwd(), 'scripts/evidence-backfill/out')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = path.join(outDir, `dry-run-pilot-${stamp}.json`)
  fs.writeFileSync(outFile, JSON.stringify({ summary, results }, null, 2))
  console.log(JSON.stringify({ event: 'wrote_report', path: outFile }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
