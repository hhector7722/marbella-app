-- Conservatively consolidate only 3 verified identical ingredients.
-- No UPDATE/DELETE on stock_movements, no stock_current changes, no stock transaction.
-- Historical invoice mappings + receipt confirmations remain anchored to their original IDs.
CREATE TABLE IF NOT EXISTS public.ingredient_consolidation_aliases (
 duplicate_ingredient_id uuid PRIMARY KEY REFERENCES public.ingredients(id),
 canonical_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 reason text NOT NULL,
 baseline_duplicate_stock numeric NOT NULL,
 baseline_canonical_stock numeric NOT NULL,
 moved_supplier_mapping_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ingredient_alias_not_self CHECK(duplicate_ingredient_id<>canonical_ingredient_id)
);
ALTER TABLE public.ingredient_consolidation_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingredient_consolidation_aliases FROM PUBLIC,anon;
GRANT SELECT ON public.ingredient_consolidation_aliases TO authenticated;
DROP POLICY IF EXISTS ingredient_aliases_manager_select ON public.ingredient_consolidation_aliases;
CREATE POLICY ingredient_aliases_manager_select ON public.ingredient_consolidation_aliases
 FOR SELECT TO authenticated
 USING ((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

DO $merge$
DECLARE
 v_rec record;
 v_source public.ingredients%ROWTYPE;
 v_target public.ingredients%ROWTYPE;
 v_moved integer;
 v_stock_before numeric;
 v_stock_after numeric;
 v_ledger_before integer;
 v_ledger_after integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('marbella-ingredient-consolidation-2026-10-27'));
 CREATE TEMP TABLE candidates (
  duplicate uuid PRIMARY KEY, canonical uuid NOT NULL,reason text NOT NULL
 ) ON COMMIT DROP;
 INSERT INTO candidates VALUES
  ('ccb183fa-2507-4543-b0ef-38e5e995fe44','1a5ad53f-fee8-4e86-b42a-ed0e0e7516e2',
    'Orégano spelling duplicate; recent ingredient has active recipe and a validated nonzero price, both stock zero'),
  ('1bea9ef6-09f8-4d50-9d03-f0de08f4775d','0187d23b-48f8-4965-981c-7c71e66ac7ed',
    'Queso Rulo Cabra 1kg = Queso de cabra, both grams, matching price 13.63, original retains image'),
  ('2297f02d-1265-4721-a57c-aa6f93ee255b','ca2313e1-16b6-4563-945b-a024ed05aa2e',
    'Sanet jabón manual = Jabón Manos; supplier SANET variants already mapped to old, both ml and price 1.156');

 SELECT sum(stock_current) INTO v_stock_before FROM public.ingredients
 WHERE id IN(SELECT duplicate FROM candidates UNION SELECT canonical FROM candidates);
 SELECT count(*) INTO v_ledger_before FROM public.stock_movements
 WHERE ingredient_id IN(SELECT duplicate FROM candidates UNION SELECT canonical FROM candidates);

 FOR v_rec IN SELECT * FROM candidates LOOP
  SELECT * INTO STRICT v_source FROM public.ingredients WHERE id=v_rec.duplicate FOR UPDATE;
  SELECT * INTO STRICT v_target FROM public.ingredients WHERE id=v_rec.canonical FOR UPDATE;
  IF v_source.base_unit<>v_target.base_unit
    OR v_source.archived_at IS NOT NULL OR v_target.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Unidades o estados incompatibles para % y %',v_source.name,v_target.name;
  END IF;
  IF v_source.stock_current<>0 THEN
    RAISE EXCEPTION 'El duplicado % tiene stock contable: revisión manual',v_source.name;
  END IF;
  IF v_rec.duplicate='ccb183fa-2507-4543-b0ef-38e5e995fe44'::uuid THEN
    IF v_source.name<>'Orégano' OR v_target.name<>'Oregano'
      OR v_target.current_price<=0 OR
      EXISTS(SELECT 1 FROM public.recipe_ingredients WHERE ingredient_id=v_source.id)
      OR EXISTS(SELECT 1 FROM public.stock_movements WHERE ingredient_id=v_source.id)
    THEN RAISE EXCEPTION 'Orégano ya ha cambiado, cancelar';END IF;
  ELSE
    IF v_source.current_price<>v_target.current_price OR
       v_target.image_url IS NULL THEN
      RAISE EXCEPTION 'Precio o imagen canónicos no verificados: %',v_source.name;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.ingredient_consolidation_aliases WHERE duplicate_ingredient_id=v_rec.duplicate)
  THEN RAISE EXCEPTION 'Duplicado ya consolidado: %',v_source.name;END IF;
  UPDATE public.supplier_item_mappings SET ingredient_id=v_rec.canonical
    WHERE ingredient_id=v_rec.duplicate;
  GET DIAGNOSTICS v_moved=ROW_COUNT;
  -- For the canonical older ingredients, preserve its image, ID and price.
  -- For Orégano, keep newer priced recipe ingredient as canonical.
  UPDATE public.ingredients SET inventory_visible=true
    WHERE id=v_rec.canonical;
  UPDATE public.ingredients SET inventory_visible=false, archived_at=now()
    WHERE id=v_rec.duplicate;
  IF v_rec.duplicate='ccb183fa-2507-4543-b0ef-38e5e995fe44'::uuid THEN
    -- Names are unique globally, including archived records.
    UPDATE public.ingredients SET name='Orégano (duplicado histórico)' WHERE id=v_rec.duplicate;
    UPDATE public.ingredients SET name='Orégano' WHERE id=v_rec.canonical;
  END IF;
  INSERT INTO public.ingredient_consolidation_aliases(
   duplicate_ingredient_id,canonical_ingredient_id,reason,
   baseline_duplicate_stock,baseline_canonical_stock,moved_supplier_mapping_count
  ) VALUES(v_rec.duplicate,v_rec.canonical,v_rec.reason,
           v_source.stock_current,v_target.stock_current,v_moved);
 END LOOP;
 SELECT sum(stock_current) INTO v_stock_after FROM public.ingredients
 WHERE id IN(SELECT duplicate FROM candidates UNION SELECT canonical FROM candidates);
 SELECT count(*) INTO v_ledger_after FROM public.stock_movements
 WHERE ingredient_id IN(SELECT duplicate FROM candidates UNION SELECT canonical FROM candidates);
 IF v_stock_before IS DISTINCT FROM v_stock_after OR v_ledger_before<>v_ledger_after THEN
  RAISE EXCEPTION 'Se ha alterado stock/cantidad de movimientos: rollback';
 END IF;
END;
$merge$;

-- Prevent creating a second unarchived variant differing only by accent/case.
CREATE OR REPLACE FUNCTION public.ingredient_normalized_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $key$
 SELECT lower(translate(btrim(p_name),
  'ÁÀÄÉÈËÍÌÏÓÒÖÚÙÜÑáàäéèëíìïóòöúùüñ',
  'AAAEEEIIIOOOUUUNaaaeeeiiiooouuun'));
$key$;
CREATE UNIQUE INDEX IF NOT EXISTS ingredients_active_normalized_name_unique
ON public.ingredients (public.ingredient_normalized_name(name))
WHERE archived_at IS NULL;
