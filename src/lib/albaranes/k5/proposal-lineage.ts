export type K5ProposalLineageRow = Record<string, unknown> & {
  id?: unknown
  proposal_set_id?: unknown
  supersedes_proposal_id?: unknown
  provenance?: unknown
  created_at?: unknown
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function hasHumanRevision(provenance: unknown): boolean {
  return Boolean(
    provenance
    && typeof provenance === 'object'
    && !Array.isArray(provenance)
    && Object.prototype.hasOwnProperty.call(provenance, 'revision')
  )
}

function createdAtMs(row: K5ProposalLineageRow): number {
  const parsed = Date.parse(text(row.created_at))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Devuelve solo las hojas que pertenecen a la generación K5 base más reciente
 * y a sus revisiones humanas descendientes.
 *
 * Las recalculaciones son append-only y pueden cambiar por completo las claves
 * tabla/fila. Por eso "todas las hojas globales" no representa el estado
 * actual: una hoja vieja sin sucesor directo puede seguir existiendo aunque ya
 * haya una generación posterior. Conservamos todo el historial, pero la UI solo
 * presenta la línea de descendencia del último proposal_set base.
 */
export function selectCurrentProposalLineage<T extends K5ProposalLineageRow>(rows: readonly T[]): T[] {
  if (rows.length === 0) return []

  const baseRows = rows.filter((row) => !hasHumanRevision(row.provenance) && text(row.proposal_set_id))
  if (baseRows.length === 0) return []

  let latestBase = baseRows[0]!
  for (const row of baseRows.slice(1)) {
    if (createdAtMs(row) >= createdAtMs(latestBase)) latestBase = row
  }
  const latestSetId = text(latestBase.proposal_set_id)
  if (!latestSetId) return []

  const lineageIds = new Set(
    rows
      .filter((row) => text(row.proposal_set_id) === latestSetId)
      .map((row) => text(row.id))
      .filter(Boolean)
  )
  if (lineageIds.size === 0) return []

  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      const id = text(row.id)
      const parentId = text(row.supersedes_proposal_id)
      if (id && parentId && lineageIds.has(parentId) && !lineageIds.has(id)) {
        lineageIds.add(id)
        changed = true
      }
    }
  }

  const lineageRows = rows.filter((row) => lineageIds.has(text(row.id)))
  const supersededInLineage = new Set(
    lineageRows.map((row) => text(row.supersedes_proposal_id)).filter(Boolean)
  )

  return lineageRows.filter((row) => !supersededInLineage.has(text(row.id)))
}
