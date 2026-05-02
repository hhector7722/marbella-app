-- Visibilidad en la página de recuento /dashboard/inventory (no afecta al resto del sistema).

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS inventory_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ingredients.inventory_visible IS
  'Si es false, el ingrediente no se lista en /dashboard/inventory. Por defecto true.';

CREATE INDEX IF NOT EXISTS idx_ingredients_inventory_visible
  ON public.ingredients (inventory_visible)
  WHERE inventory_visible = false;
