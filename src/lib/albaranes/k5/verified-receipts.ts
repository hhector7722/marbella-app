export type VerifiedReceiptRow = {
  proposalId: string
  lineId: string | null
  mappingVersionId: string | null
  sourceItemName: string
  disposition: string
}

export type VerifiedReceiptOutcome = {
  proposalId: string
  name: string
  status: 'confirmed' | 'skipped' | 'blocked'
  reason: string
}

export type VerifiedReceiptResult = {
  confirmed: number
  skipped: number
  blocked: number
  outcomes: VerifiedReceiptOutcome[]
}

type OperationResult = { success: true; idempotent?: boolean } | { success: false; code?: string; message: string }

/** K4 sigue siendo el único productor de stock; este coordinador solo clasifica sus respuestas. */
export async function runVerifiedReceiptBatch(
  proposalIds: string[],
  rows: VerifiedReceiptRow[],
  operations: {
    preview: (lineId: string, mappingVersionId: string) => Promise<OperationResult>
    apply: (lineId: string, mappingVersionId: string, idempotencyKey: string) => Promise<OperationResult>
  }
): Promise<VerifiedReceiptResult> {
  const byId = new Map(rows.map((row) => [row.proposalId, row]))
  const outcomes: VerifiedReceiptOutcome[] = []

  for (const proposalId of proposalIds) {
    const row = byId.get(proposalId)
    const name = row?.sourceItemName || 'Línea no disponible'
    const record = (status: VerifiedReceiptOutcome['status'], reason: string) => {
      outcomes.push({ proposalId, name, status, reason })
    }
    if (!row) {
      record('skipped', 'La propuesta ya no está activa.')
      continue
    }
    if (row.disposition === 'confirmed' || row.disposition === 'excluded') {
      record('skipped', row.disposition === 'confirmed' ? 'Ya estaba confirmada.' : 'Línea excluida de recepción.')
      continue
    }
    if (row.disposition !== 'ready' || !row.lineId || !row.mappingVersionId) {
      record('blocked', 'La línea necesita revisión o mapeo.')
      continue
    }
    try {
      const preview = await operations.preview(row.lineId, row.mappingVersionId)
      if (!preview.success) {
        record(preview.code === 'receipt_already_applied' ? 'skipped' : 'blocked', preview.message)
        continue
      }
      const applied = await operations.apply(
        row.lineId, row.mappingVersionId, `receipt-verified:${row.lineId}`
      )
      if (!applied.success) {
        record(applied.code === 'receipt_already_applied' ? 'skipped' : 'blocked', applied.message)
      } else {
        record(applied.idempotent ? 'skipped' : 'confirmed', applied.idempotent ? 'Ya estaba confirmada.' : 'Recepción confirmada.')
      }
    } catch {
      record('blocked', 'No se pudo verificar la línea. Vuelve a intentarlo.')
    }
  }

  return {
    confirmed: outcomes.filter((item) => item.status === 'confirmed').length,
    skipped: outcomes.filter((item) => item.status === 'skipped').length,
    blocked: outcomes.filter((item) => item.status === 'blocked').length,
    outcomes,
  }
}
