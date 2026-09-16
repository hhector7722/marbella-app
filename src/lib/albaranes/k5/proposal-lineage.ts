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

export function proposalAncestryIds<T extends K5ProposalLineageRow>(rows: readonly T[], startId: string): string[] {
  const byId = new Map(rows.map((row) => [text(row.id), row]))
  const ids: string[] = []
  const seen = new Set<string>()
  let cursor = text(startId)
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    ids.push(cursor)
    const row = byId.get(cursor)
    cursor = text(row?.supersedes_proposal_id)
  }
  return ids
}

/**
 * Devuelve las hojas del último proposal_set base y de sus revisiones humanas
 * descendientes. El historial anterior sigue intacto, pero deja de contaminar
 * el estado operativo actual cuando una recalculación cambia tabla/fila.
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
