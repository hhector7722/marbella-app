/**
 * Solo cambia el orden visual del escandallo, nunca los componentes guardados
 * ni su coste. La categoría Packaging es canónica; los nombres reconocibles
 * cubren materiales que por error están clasificados como Alimentos/Bebidas/Otros.
 */
type RecipeMaterial = {
  name?: string | null
  category?: string | null
}

type RecipeLineWithMaterial = {
  ingredients?: RecipeMaterial | null
}

const NON_CULINARY_CATEGORIES = new Set([
  'packaging',
  'envases',
  'embalajes',
  'desechables',
  'consumibles',
  'utensilios',
  'menaje',
  'limpieza',
  'higiene',
  'material no alimentario',
])

const PACKAGING_NAME_PATTERN =
  /^(?:film\b|(?:servilletas?|cucharitas?|cucharas?|tenedores?|cubiertos?|pajitas?|palillos?|vasos?|bandejas?|bolsas?|envases?|barquetas?|envoltorios?)\b|papel\s+(?:aluminio|horno|film|cocina)\b|rollos?\s+(?:papel|film)\b|platos?\s+(?:carton|papel|plastico|desechables?)\b|tapas?\s+(?:\d|vaso|envase)\b)/

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function isNonCulinaryRecipeMaterial(material: RecipeMaterial | null | undefined): boolean {
  if (!material) return false
  if (NON_CULINARY_CATEGORIES.has(normalized(material.category))) return true
  return PACKAGING_NAME_PATTERN.test(normalized(material.name))
}

export function groupRecipeIngredients<T extends RecipeLineWithMaterial>(
  rows: readonly T[],
): { ordered: T[]; separatorIndex: number | null } {
  const culinary: T[] = []
  const nonCulinary: T[] = []
  for (const row of rows) {
    if (isNonCulinaryRecipeMaterial(row.ingredients)) nonCulinary.push(row)
    else culinary.push(row)
  }
  return {
    ordered: [...culinary, ...nonCulinary],
    separatorIndex: culinary.length > 0 && nonCulinary.length > 0 ? culinary.length : null,
  }
}
