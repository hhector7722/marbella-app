-- Precio canónico de ingrediente: una sola magnitud y dos writers.
--
-- Writers permitidos para ingredients.current_price:
--   1. K4 / apply_receipt_line, con origen receipt_confirmation.
--   2. set_ingredient_current_price, con origen manual.
--
-- Los campos pack_* se conservan como metadatos físicos transitorios. Ningún
-- cambio en ellos puede volver a producir o sobrescribir current_price.

DROP TRIGGER IF EXISTS trigger_ingredients_pack_pricing_sync ON public.ingredients;
DROP FUNCTION IF EXISTS public.trg_ingredients_pack_pricing_sync();
DROP FUNCTION IF EXISTS public.compute_ingredient_current_price_from_pack(
  numeric,
  numeric,
  numeric,
  text,
  text
);

DROP TRIGGER IF EXISTS trigger_log_price_history ON public.ingredients;
DROP FUNCTION IF EXISTS public.log_price_change();

CREATE OR REPLACE FUNCTION private.guard_canonical_ingredient_price_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.current_price IS NOT DISTINCT FROM NEW.current_price THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.receipt_confirmation_price_write', true), '') = 'on'
     OR COALESCE(current_setting('app.manual_ingredient_price_write', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'CANONICAL_PRICE_WRITER_ONLY: use apply_receipt_line or set_ingredient_current_price';
END;
$$;

REVOKE ALL ON FUNCTION private.guard_canonical_ingredient_price_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_canonical_ingredient_price_write() TO service_role;

DROP TRIGGER IF EXISTS guard_canonical_ingredient_price_write ON public.ingredients;
CREATE TRIGGER guard_canonical_ingredient_price_write
BEFORE UPDATE OF current_price ON public.ingredients
FOR EACH ROW
EXECUTE FUNCTION private.guard_canonical_ingredient_price_write();

CREATE OR REPLACE FUNCTION private.set_ingredient_current_price(
  p_ingredient_id uuid,
  p_new_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_ingredient public.ingredients%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'forbidden',
      'message', 'Solo manager o admin puede cambiar el precio.'
    );
  END IF;

  IF p_ingredient_id IS NULL OR p_new_price IS NULL OR p_new_price <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_price',
      'message', 'El precio debe ser mayor que cero.'
    );
  END IF;

  SELECT *
  INTO v_ingredient
  FROM public.ingredients
  WHERE id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'El ingrediente no existe.'
    );
  END IF;

  IF v_ingredient.current_price IS NOT DISTINCT FROM p_new_price THEN
    RETURN jsonb_build_object(
      'ok', true,
      'changed', false,
      'ingredient_id', v_ingredient.id,
      'current_price', v_ingredient.current_price,
      'purchase_unit', v_ingredient.purchase_unit
    );
  END IF;

  PERFORM set_config('app.manual_ingredient_price_write', 'on', true);

  UPDATE public.ingredients
  SET current_price = p_new_price,
      updated_at = v_now
  WHERE id = v_ingredient.id;

  INSERT INTO public.ingredient_price_history (
    ingredient_id,
    old_price,
    new_price,
    changed_by,
    changed_at,
    source,
    provenance
  ) VALUES (
    v_ingredient.id,
    v_ingredient.current_price,
    p_new_price,
    v_actor_id,
    v_now,
    'manual',
    jsonb_build_object(
      'schema_version', 'canonical-price-v1',
      'origin', 'set_ingredient_current_price',
      'purchase_unit', v_ingredient.purchase_unit
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'ingredient_id', v_ingredient.id,
    'old_price', v_ingredient.current_price,
    'current_price', p_new_price,
    'purchase_unit', v_ingredient.purchase_unit,
    'source', 'manual'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.set_ingredient_current_price(uuid, numeric)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_ingredient_current_price(uuid, numeric)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_ingredient_current_price(
  p_ingredient_id uuid,
  p_new_price numeric
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.set_ingredient_current_price(p_ingredient_id, p_new_price);
$$;

REVOKE ALL ON FUNCTION public.set_ingredient_current_price(uuid, numeric)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ingredient_current_price(uuid, numeric)
TO authenticated, service_role;

COMMENT ON FUNCTION public.set_ingredient_current_price(uuid, numeric) IS
  'Único writer manual del precio canónico en ingredients.current_price; conserva purchase_unit y registra source=manual.';
