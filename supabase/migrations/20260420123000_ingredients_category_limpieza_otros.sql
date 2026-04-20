-- Expand allowed categories for ingredients.category
-- Existing CHECK only allows: Alimentos, Packaging, Bebidas
-- We add: Limpieza, Otros (used elsewhere in the app for suppliers)

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_category_check;

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_category_check
  CHECK (
    category IS NULL
    OR category::text = ANY (
      ARRAY[
        'Alimentos'::varchar,
        'Packaging'::varchar,
        'Bebidas'::varchar,
        'Limpieza'::varchar,
        'Otros'::varchar
      ]::text[]
    )
  );

