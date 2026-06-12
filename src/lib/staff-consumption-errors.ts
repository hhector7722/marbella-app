/** Extrae el nombre de receta del mensaje de error de process_staff_consumption / validate. */
export function parseConsumptionErrorRecipeName(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/en "([^"]+)"/);
  return match?.[1]?.trim() ?? null;
}

export function matchRecipeIdsByName(
  recipeName: string,
  recipes: { id: string; name: string }[],
): string[] {
  const normalized = recipeName.trim().toLowerCase();
  return recipes
    .filter((r) => r.name.trim().toLowerCase() === normalized)
    .map((r) => r.id);
}
