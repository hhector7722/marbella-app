export type RecipeProductionLink = { id: string; name: string };

type ProductionComponent = {
  child: { id: string; name: string; is_sellable: boolean }
};

/** Un enlace sólo cuando el plato consume realmente una elaboración interna. */
export function productionLinksForRecipe(
  isSellable: boolean,
  components: readonly ProductionComponent[],
): RecipeProductionLink[] {
  if (!isSellable) return [];
  const unique = new Map<string, RecipeProductionLink>();
  for (const { child } of components) {
    if (!child.is_sellable && !unique.has(child.id)) {
      unique.set(child.id, { id: child.id, name: child.name });
    }
  }
  return Array.from(unique.values());
}
