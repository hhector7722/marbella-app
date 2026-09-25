-- Impide persistir un ciclo en recipe_subrecipes.
-- El CHECK de autorreferencia de B1 permanece. Este trigger cubre el ciclo indirecto
-- y también la autorreferencia, para que el error de dominio sea el mismo.
--
-- SECURITY DEFINER: la invariante tiene que ver el grafo completo. Con INVOKER,
-- una policy RLS más estrecha que MASTER_ALL_SUBRECIPES ocultaría aristas y
-- dejaría cerrar un ciclo. El dueño de la tabla no tiene FORCE ROW LEVEL SECURITY,
-- así que esta función ve todas las filas. search_path fijo, sin SQL dinámico.
--
-- pg_advisory_xact_lock: dos transacciones pueden comprobar A→B y B→A antes de
-- ver el INSERT de la otra (write skew). El mismo candado serializa todo cambio
-- de parent/child. Se libera solo en COMMIT o ROLLBACK.

CREATE OR REPLACE FUNCTION public.recipe_subrecipes_reject_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  exclude_id uuid;
  cycle_path uuid[];
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.parent_recipe_id IS NOT DISTINCT FROM NEW.parent_recipe_id
     AND OLD.child_recipe_id IS NOT DISTINCT FROM NEW.child_recipe_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marbella:recipe_subrecipes:graph', 0)
  );

  IF NEW.parent_recipe_id = NEW.child_recipe_id THEN
    RAISE EXCEPTION 'recipe_subrecipes produciría un ciclo'
      USING ERRCODE = '23514',
            DETAIL = format(
              'parent=%s child=%s path=%s',
              NEW.parent_recipe_id,
              NEW.child_recipe_id,
              NEW.parent_recipe_id
            );
  END IF;

  exclude_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;

  WITH RECURSIVE walk AS (
    SELECT
      rs.child_recipe_id AS node,
      ARRAY[NEW.child_recipe_id, rs.child_recipe_id] AS path
    FROM public.recipe_subrecipes AS rs
    WHERE rs.parent_recipe_id = NEW.child_recipe_id
      AND (exclude_id IS NULL OR rs.id IS DISTINCT FROM exclude_id)
    UNION ALL
    SELECT
      rs.child_recipe_id,
      walk.path || rs.child_recipe_id
    FROM walk
    JOIN public.recipe_subrecipes AS rs
      ON rs.parent_recipe_id = walk.node
    WHERE NOT (rs.child_recipe_id = ANY (walk.path))
      AND (exclude_id IS NULL OR rs.id IS DISTINCT FROM exclude_id)
  )
  SELECT walk.path
  INTO cycle_path
  FROM walk
  WHERE walk.node = NEW.parent_recipe_id
  LIMIT 1;

  IF cycle_path IS NOT NULL THEN
    RAISE EXCEPTION 'recipe_subrecipes produciría un ciclo'
      USING ERRCODE = '23514',
            DETAIL = format(
              'parent=%s child=%s path=%s',
              NEW.parent_recipe_id,
              NEW.child_recipe_id,
              pg_catalog.array_to_string(cycle_path, ' -> ')
            );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.recipe_subrecipes_reject_cycle() IS
  'Rechaza un ciclo en recipe_subrecipes. Ve el grafo entero (SECURITY DEFINER, sin FORCE RLS) y serializa el cambio con pg_advisory_xact_lock para que A→B y B→A concurrentes no confirmen los dos.';

CREATE TRIGGER recipe_subrecipes_cycle_guard
  BEFORE INSERT OR UPDATE OF parent_recipe_id, child_recipe_id
  ON public.recipe_subrecipes
  FOR EACH ROW
  EXECUTE FUNCTION public.recipe_subrecipes_reject_cycle();

COMMENT ON TRIGGER recipe_subrecipes_cycle_guard ON public.recipe_subrecipes IS
  'Solo parent/child. quantity y unit no disparan la búsqueda. El CHECK de autorreferencia de B1 sigue activo.';

REVOKE ALL ON FUNCTION public.recipe_subrecipes_reject_cycle() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recipe_subrecipes_reject_cycle() TO authenticated, service_role;
