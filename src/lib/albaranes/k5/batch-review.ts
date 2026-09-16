export type K5BatchDisposition =
  | 'ready'
  | 'confirmed'
  | 'needs_mapping'
  | 'needs_review'
  | 'order_review'
  | 'excluded'
  | 'unavailable'

export type K5BatchCandidateInput = {
  status: string
  mappingVersionId: string | null
  ingredientId: string | null
  lineId: string | null
  confirmed: boolean
  pendingOrderCount: number
}

export function classifyK5BatchCandidate(input: K5BatchCandidateInput): K5BatchDisposition {
  if (input.confirmed) return 'confirmed'
  if (input.status === 'excluded') return 'excluded'
  if (input.status === 'needs_mapping') return 'needs_mapping'
  if (input.status === 'needs_review') return 'needs_review'
  if (input.status !== 'ready_for_review') return 'unavailable'
  if (!input.mappingVersionId || !input.ingredientId || !input.lineId) return 'unavailable'
  if (input.pendingOrderCount > 0) return 'order_review'
  return 'ready'
}
