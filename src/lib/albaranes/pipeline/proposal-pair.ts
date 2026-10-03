/** K5 exige que ingrediente y versión de presentación aparezcan juntos. */
export function proposalMappingPair(ingredientId: string | null,
  mappingVersionId: string | null): { ingredientId: string | null; mappingVersionId: string | null } {
  return ingredientId && mappingVersionId
    ? { ingredientId, mappingVersionId }
    : { ingredientId: null, mappingVersionId: null }
}
