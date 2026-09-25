-- Los checks de B1 (`> 0`) aceptan NaN e Infinity en numeric.
-- Esta migración no reescribe 20260925143000. Añade el guard de finitud.

ALTER TABLE public.recipes
  DROP CONSTRAINT IF EXISTS recipes_yield_quantity_finite_check;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_yield_quantity_finite_check
  CHECK (
    yield_quantity IS NULL
    OR (
      yield_quantity <> 'NaN'::numeric
      AND yield_quantity <> 'Infinity'::numeric
      AND yield_quantity <> '-Infinity'::numeric
    )
  );

ALTER TABLE public.recipe_subrecipes
  DROP CONSTRAINT IF EXISTS recipe_subrecipes_quantity_finite_check;

ALTER TABLE public.recipe_subrecipes
  ADD CONSTRAINT recipe_subrecipes_quantity_finite_check
  CHECK (
    quantity <> 'NaN'::numeric
    AND quantity <> 'Infinity'::numeric
    AND quantity <> '-Infinity'::numeric
  );

COMMENT ON CONSTRAINT recipes_yield_quantity_finite_check ON public.recipes IS
  'NaN e Infinity no son un rendimiento. El check > 0 de B1 no los rechaza.';

COMMENT ON CONSTRAINT recipe_subrecipes_quantity_finite_check ON public.recipe_subrecipes IS
  'NaN e Infinity no son una cantidad consumida. El check > 0 de B1 no los rechaza.';
