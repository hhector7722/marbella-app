/**
 * Único módulo de escritura del backfill Evidence-only.
 * Allowlist estricta:
 *  1) RPC persist_document_evidence
 *  2) INSERT purchase_line_provenance
 * Cualquier otra escritura falla explícitamente.
 */

export const EVIDENCE_WRITER_ALLOWED_RPC = new Set(['persist_document_evidence'] as const)
export const EVIDENCE_WRITER_ALLOWED_INSERT_TABLES = new Set(['purchase_line_provenance'] as const)

export type PersistEvidenceParams = {
  invoiceId: string
  fileVersionHash: string
  extractorVersion: string
  rawJsonArtifact: unknown
  status: 'success' | 'failed' | 'no_table'
  tables: unknown | null
}

export type PersistEvidenceResult = {
  extraction_id: string
  row_mapping: Record<string, string>
  /** false si la RPC no insertó (ya existía / carrera). */
  inserted: boolean
}

export type ProvenanceInsertRow = {
  invoice_line_id: string
  document_row_id: string
  linked_by: string
  confidence_score: number | null
}

export type EvidenceWriteClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>
  from: (table: string) => {
    insert: (
      rows: unknown
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  }
}

export class EvidenceWriteBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvidenceWriteBlockedError'
  }
}

function isUniqueViolation(error: { message: string; code?: string } | null): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key|unique constraint/i.test(error.message)
}

export class EvidenceOnlyWriter {
  private readonly allowWrite: boolean
  private readonly client: EvidenceWriteClient
  private writeCount = 0

  constructor(client: EvidenceWriteClient, opts: { allowWrite: boolean }) {
    this.client = client
    this.allowWrite = opts.allowWrite
  }

  getWriteCount(): number {
    return this.writeCount
  }

  private assertWritable() {
    if (!this.allowWrite) {
      throw new EvidenceWriteBlockedError(
        'EvidenceOnlyWriter: escritura deshabilitada (dry-run o allowWrite=false)'
      )
    }
  }

  assertRpcAllowed(fn: string) {
    if (!EVIDENCE_WRITER_ALLOWED_RPC.has(fn as 'persist_document_evidence')) {
      throw new EvidenceWriteBlockedError(
        `EvidenceOnlyWriter: RPC no permitida: ${fn}`
      )
    }
  }

  assertInsertTableAllowed(table: string) {
    if (!EVIDENCE_WRITER_ALLOWED_INSERT_TABLES.has(table as 'purchase_line_provenance')) {
      throw new EvidenceWriteBlockedError(
        `EvidenceOnlyWriter: INSERT no permitido en tabla: ${table}`
      )
    }
  }

  /** Intento genérico de escritura fuera de allowlist — siempre falla. */
  forbidWrite(operation: string, target: string): never {
    throw new EvidenceWriteBlockedError(
      `EvidenceOnlyWriter: operación prohibida ${operation} sobre ${target}`
    )
  }

  async persistDocumentEvidence(params: PersistEvidenceParams): Promise<PersistEvidenceResult> {
    this.assertWritable()
    this.assertRpcAllowed('persist_document_evidence')

    const { data, error } = await this.client.rpc('persist_document_evidence', {
      p_invoice_id: params.invoiceId,
      p_file_version_hash: params.fileVersionHash,
      p_extractor_version: params.extractorVersion,
      p_raw_json_artifact: params.rawJsonArtifact,
      p_status: params.status,
      p_tables: params.tables,
    })

    if (error) {
      throw new Error(`persist_document_evidence: ${error.message}`)
    }

    const payload = (data ?? {}) as {
      extraction_id?: string
      row_mapping?: Record<string, string>
      inserted?: boolean
    }

    const inserted = payload.inserted !== false
    if (inserted) this.writeCount += 1

    return {
      extraction_id: String(payload.extraction_id ?? ''),
      row_mapping: payload.row_mapping ?? {},
      inserted,
    }
  }

  /**
   * Inserta provenance. Ante UNIQUE (invoice_line_id, document_row_id)
   * trata el conflicto como idempotente (0 filas nuevas).
   */
  async insertProvenance(rows: ProvenanceInsertRow[]): Promise<{ inserted: number; skipped: number }> {
    this.assertWritable()
    if (rows.length === 0) return { inserted: 0, skipped: 0 }
    this.assertInsertTableAllowed('purchase_line_provenance')

    let inserted = 0
    let skipped = 0

    for (const row of rows) {
      const { error } = await this.client.from('purchase_line_provenance').insert(row)
      if (!error) {
        inserted += 1
        this.writeCount += 1
        continue
      }
      if (isUniqueViolation(error)) {
        skipped += 1
        continue
      }
      throw new Error(`purchase_line_provenance insert: ${error.message}`)
    }

    return { inserted, skipped }
  }
}

/**
 * Envuelve un cliente Supabase-like y bloquea writes fuera de allowlist
 * a nivel de API del wrapper (defensa en profundidad para tests/job).
 */
export function createGuardedEvidenceClient(
  underlying: EvidenceWriteClient,
  opts: { allowWrite: boolean }
): EvidenceWriteClient {
  return {
    async rpc(fn, args) {
      if (!opts.allowWrite) {
        throw new EvidenceWriteBlockedError('Guarded client: dry-run no puede RPC de escritura')
      }
      if (!EVIDENCE_WRITER_ALLOWED_RPC.has(fn as 'persist_document_evidence')) {
        throw new EvidenceWriteBlockedError(`Guarded client: RPC bloqueada: ${fn}`)
      }
      return underlying.rpc(fn, args)
    },
    from(table: string) {
      return {
        async insert(rows: unknown) {
          if (!opts.allowWrite) {
            throw new EvidenceWriteBlockedError('Guarded client: dry-run no puede INSERT')
          }
          if (!EVIDENCE_WRITER_ALLOWED_INSERT_TABLES.has(table as 'purchase_line_provenance')) {
            throw new EvidenceWriteBlockedError(`Guarded client: INSERT bloqueado en ${table}`)
          }
          return underlying.from(table).insert(rows)
        },
      }
    },
  }
}
