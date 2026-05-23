-- Unidad por defecto al añadir el ingrediente a una receta (la línea en recipe_ingredients sigue siendo editable).
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS recipe_unit text NOT NULL DEFAULT 'kg';

COMMENT ON COLUMN public.ingredients.recipe_unit IS
  'Unidad habitual en escandallo. Valor inicial al insertar en recipe_ingredients; editable después en la receta.';

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_recipe_unit_check;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_recipe_unit_check
  CHECK (recipe_unit IN ('g', 'kg', 'ml', 'cl', 'l', 'ud'));

UPDATE public.ingredients i
SET recipe_unit = CASE
  WHEN lower(trim(i.purchase_unit)) IN ('g', 'kg', 'ml', 'cl', 'l', 'ud') THEN lower(trim(i.purchase_unit))
  WHEN lower(trim(i.purchase_unit)) IN ('lt', 'litro') THEN 'l'
  WHEN lower(trim(i.purchase_unit)) IN ('gr') THEN 'g'
  WHEN lower(trim(i.purchase_unit)) IN ('u', 'un', 'unidad') THEN 'ud'
  WHEN lower(trim(i.unit_type)) IN ('g', 'kg', 'ml', 'cl', 'l', 'ud') THEN lower(trim(i.unit_type))
  ELSE 'kg'
END;
