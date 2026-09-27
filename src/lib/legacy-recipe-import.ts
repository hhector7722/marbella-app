export const LEGACY_SUBRECIPE_OVERWRITE_MESSAGE =
  'no se puede sobreescribir porque contiene elaboraciones/subrecetas. Edita su composición desde Recetas.'

export type LegacyRecipeImportDecision =
  | { action: 'create'; is_sellable: true }
  | { action: 'skip' }
  | { action: 'overwrite' }
  | { action: 'reject'; message: string }

export function decideLegacyRecipeImport(input: {
  recipeName: string
  exists: boolean
  overwriteExisting: boolean
  ownsSubrecipes: boolean
}): LegacyRecipeImportDecision {
  if (!input.exists) return { action: 'create', is_sellable: true }
  if (!input.overwriteExisting) return { action: 'skip' }
  if (input.ownsSubrecipes) {
    return {
      action: 'reject',
      message: `Receta "${input.recipeName}": ${LEGACY_SUBRECIPE_OVERWRITE_MESSAGE}`,
    }
  }
  return { action: 'overwrite' }
}
