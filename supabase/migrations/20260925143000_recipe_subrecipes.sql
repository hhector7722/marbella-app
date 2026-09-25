-- Bloque 1 (ADR-0018): soporte estructural de elaboraciones intermedias.
-- No calcula coste, no mueve stock y no rellena subrecetas existentes.
--
-- is_sellable default true no se deduce de sale_price. Las filas actuales
-- siguen vendiéndose como hasta ahora y el rendimiento queda sin informar
-- (NULL/NULL), nunca como cero.
--
-- ON DELETE:
-- recipe_ingredients.recipe_id ya borra en cascada la composición de la receta
-- que desaparece. parent_recipe_id replica eso: la línea pertenece al padre.
-- recipe_ingredients.ingredient_id también hace CASCADE, pero eso borra en
-- silencio una línea de otra receta. Aquí child_recipe_id es RESTRICT: no se
-- puede borrar una elaboración mientras otra la consume.

ALTER TABLE public.recipes
  ADD COLUMN is_sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN yield_quantity numeric(12,3),
  ADD COLUMN yield_unit text;

COMMENT ON COLUMN public.recipes.is_sellable IS
  'Verdadero si la elaboración se vende directamente. Independiente de sale_price. Default true solo por compatibilidad con las recetas ya existentes.';

COMMENT ON COLUMN public.recipes.yield_quantity IS
  'Cantidad que produce la elaboración completa. NULL si el rendimiento aún no está declarado. Nunca se guarda como 0.';

COMMENT ON COLUMN public.recipes.yield_unit IS
  'Unidad de yield_quantity. Mismo vocabulario que ingredients.recipe_unit: g, kg, ml, cl, l, ud. NULL si el rendimiento no está declarado.';

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_yield_quantity_positive_check
  CHECK (yield_quantity IS NULL OR yield_quantity > 0);

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_yield_unit_check
  CHECK (yield_unit IS NULL OR yield_unit IN ('g', 'kg', 'ml', 'cl', 'l', 'ud'));

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_yield_pair_check
  CHECK (
    (yield_quantity IS NULL AND yield_unit IS NULL)
    OR (yield_quantity IS NOT NULL AND yield_unit IS NOT NULL)
  );

CREATE TABLE public.recipe_subrecipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  child_recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL,
  unit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_subrecipes_quantity_positive_check CHECK (quantity > 0),
  CONSTRAINT recipe_subrecipes_unit_check CHECK (unit IN ('g', 'kg', 'ml', 'cl', 'l', 'ud')),
  CONSTRAINT recipe_subrecipes_no_self_check CHECK (parent_recipe_id <> child_recipe_id),
  CONSTRAINT recipe_subrecipes_parent_child_key UNIQUE (parent_recipe_id, child_recipe_id)
);

COMMENT ON TABLE public.recipe_subrecipes IS
  'Componente de elaboración que es otra receta (ADR-0018). No es recipe_combos.';

COMMENT ON COLUMN public.recipe_subrecipes.created_at IS
  'timestamptz, convención de las tablas recientes. recipes.created_at histórico es timestamp without time zone.';

CREATE INDEX recipe_subrecipes_child_recipe_id_idx
  ON public.recipe_subrecipes (child_recipe_id);

ALTER TABLE public.recipe_subrecipes ENABLE ROW LEVEL SECURITY;

-- recipes y recipe_ingredients conservan MASTER_ALL_* con USING (true) y, en
-- el esquema inicial, GRANT ALL a anon. Esta tabla no copia ese permiso:
-- anon no recibe GRANT. El riesgo queda en las tablas viejas, no se rediseña aquí.
CREATE POLICY "MASTER_ALL_SUBRECIPES"
  ON public.recipe_subrecipes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.recipe_subrecipes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipe_subrecipes TO authenticated;
GRANT ALL ON TABLE public.recipe_subrecipes TO service_role;
