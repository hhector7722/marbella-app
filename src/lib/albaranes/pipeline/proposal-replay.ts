export type ReplayProposal = {
  id: string
  source_row_index: number | null
  supplier_profile_hash: string | null
  provenance: unknown
}

function hasHumanRevision(row: ReplayProposal): boolean {
  return Boolean(row.provenance && typeof row.provenance === 'object'
    && Object.hasOwn(row.provenance, 'revision'))
}

/** Las revisiones humanas sobreviven a una nueva versión del perfil Mistral. */
export function selectReplayProposals(
  rowsInCreatedOrder: ReplayProposal[],
  profileHash: string,
  alreadyRevised: ReadonlySet<string>
): { currentByRow: Map<number, string>; previousByRow: Map<number, string> } {
  const currentByRow = new Map<number, string>()
  const previousByRow = new Map<number, string>()
  for (const row of rowsInCreatedOrder) {
    if (row.source_row_index == null) continue
    const index = Number(row.source_row_index)
    if (hasHumanRevision(row) || row.supplier_profile_hash === profileHash) {
      currentByRow.set(index, row.id)
    } else {
      previousByRow.set(index, row.id)
    }
  }
  for (const [index, id] of previousByRow) {
    if (alreadyRevised.has(id) && !currentByRow.has(index)) currentByRow.set(index, id)
  }
  return { currentByRow, previousByRow }
}
