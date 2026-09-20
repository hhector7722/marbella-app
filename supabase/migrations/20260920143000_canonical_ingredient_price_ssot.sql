-- Canonical ingredient price SSOT.
-- Price is always ingredients.current_price in €/ingredients.purchase_unit.
-- Supplier presentations may describe physical packaging, but never derive or overwrite price.

DROP TRIGGER IF EXISTS trigger_ingredients_pack_pricing_sync ON public.ingredients;
DROP FUNCTION IF EXISTS public.trg_ingredients_pack_pricing_sync();

-- Keep unit synchronization, without any price side effect.
CREATE OR REPLACE FUNCTION public.trg_ingredients_unit_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_unit text;
BEGIN
  v_purchase_unit := public.normalize_pricing_unit(NEW.purchase_unit);
  NEW.purchase_unit := v_purchase_unit;
  NEW.unit_type := v_purchase_unit;
  NEW.base_unit := public.derive_base_unit(v_purchase_unit);
  NEW.unit := NEW.base_unit;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ingredients_unit_sync ON public.ingredients;
CREATE TRIGGER trigger_ingredients_unit_sync
BEFORE INSERT OR UPDATE OF purchase_unit
ON public.ingredients
FOR EACH ROW
EXECUTE FUNCTION public.trg_ingredients_unit_sync();

-- The implicit invoice-line writer is retired. K4 apply_receipt_line is the
-- only economic command for a receipt.
DROP TRIGGER IF EXISTS trigger_handle_new_invoice_line ON public.purchase_invoice_lines;
DROP FUNCTION IF EXISTS public.handle_new_invoice_line();

-- Guard current_price so future UI/RPC drift cannot recreate a second writer.
CREATE OR REPLACE FUNCTION private.guard_ingredient_current_price_command()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.current_price IS DISTINCT FROM NEW.current_price
     AND COALESCE(current_setting('app.receipt_confirmation_price_write', true), '') <> 'on'
     AND COALESCE(current_setting('app.manual_ingredient_price_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'INGREDIENT_PRICE_COMMAND_REQUIRED: use set_ingredient_price_manual or apply_receipt_line';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingredient_current_price_command_only ON public.ingredients;
CREATE TRIGGER ingredient_current_price_command_only
BEFORE UPDATE OF current_price
ON public.ingredients
FOR EACH ROW
EXECUTE FUNCTION private.guard_ingredient_current_price_command();

-- One audited manual writer. Receipt-originated changes remain in K4.
CREATE OR REPLACE FUNCTION public.set_ingredient_price_manual(
  p_ingredient_id uuid,
  p_current_price numeric,
  p_price_locked boolean DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_old_price numeric;
  v_old_locked boolean;
  v_unit text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT role::text
  INTO v_role
  FROM public.profiles
  WHERE id = v_actor;

  IF v_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Sin permiso para modificar precios';
  END IF;

  IF p_current_price IS NULL OR p_current_price < 0 THEN
    RAISE EXCEPTION 'Precio inválido';
  END IF;

  SELECT current_price, price_locked, purchase_unit
  INTO v_old_price, v_old_locked, v_unit
  FROM public.ingredients
  WHERE id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingrediente no encontrado';
  END IF;

  PERFORM set_config('app.manual_ingredient_price_write', 'on', true);

  UPDATE public.ingredients
  SET current_price = p_current_price,
      price_locked = COALESCE(p_price_locked, price_locked),
      updated_at = now()
  WHERE id = p_ingredient_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ingredient_id', p_ingredient_id,
    'purchase_unit', v_unit,
    'price_before', v_old_price,
    'price_after', p_current_price,
    'price_changed', v_old_price IS DISTINCT FROM p_current_price,
    'price_locked_before', v_old_locked,
    'price_locked_after', COALESCE(p_price_locked, v_old_locked),
    'reason', NULLIF(trim(COALESCE(p_reason, '')), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_ingredient_price_manual(uuid,numeric,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_ingredient_price_manual(uuid,numeric,boolean,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_ingredient_price_manual(uuid,numeric,boolean,text) TO authenticated, service_role;

-- Copilot ingredient RPC is query-only. Ingredient creation/pricing no longer
-- has a hidden machine writer.
CREATE OR REPLACE FUNCTION public.gestionar_ingredientes(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nombre text := trim(COALESCE(p_datos->>'nombre', p_datos->>'name', ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_accion NOT IN ('buscar', 'listar', 'consultar') THEN
    RETURN jsonb_build_object(
      'error', 'accion_no_soportada',
      'acciones_validas', '["buscar","listar","consultar"]'
    );
  END IF;

  IF v_nombre <> '' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
      FROM (
        SELECT id, name, current_price, purchase_unit, unit_type, stock_current, allergens
        FROM public.ingredients
        WHERE name ILIKE '%' || v_nombre || '%'
        ORDER BY name
        LIMIT 10
      ) t
    ), '[]'::jsonb);
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name)
    FROM (
      SELECT id, name, current_price, purchase_unit, stock_current
      FROM public.ingredients
      ORDER BY name
      LIMIT 50
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.gestionar_ingredientes(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestionar_ingredientes(text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.gestionar_ingredientes(text,jsonb) TO authenticated, service_role;

COMMENT ON COLUMN public.ingredients.current_price IS
  'Precio canónico actual. Siempre EUR por purchase_unit. Única fuente viva de precio del ingrediente.';
COMMENT ON COLUMN public.ingredients.pack_price IS
  'LEGACY: precio histórico de presentación. No es fuente de current_price ni debe escribirse en nuevos flujos.';
COMMENT ON COLUMN public.ingredients.pack_units IS
  'LEGACY: cantidad histórica de una presentación. No participa en el precio canónico.';
COMMENT ON COLUMN public.ingredients.supplier_pricing_mode IS
  'LEGACY: marcador histórico. No selecciona el escritor ni la fuente del precio canónico.';


-- Presentation is a physical equivalence, never a pricing mode.
-- Keep signatures for callers while removing the legacy per_pack gate.
CREATE OR REPLACE FUNCTION public.recipe_qty_to_purchase_unit_for_cost(
  p_qty numeric,
  p_recipe_unit text,
  p_purchase_unit text,
  p_mode text DEFAULT NULL,
  p_pack_qty numeric DEFAULT NULL,
  p_pack_unit text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v numeric;
  v_piece numeric;
  v_from text;
  v_purchase text;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  v := public.convert_pricing_qty(p_qty, p_recipe_unit, p_purchase_unit);
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  v_from := public.normalize_pricing_unit(p_recipe_unit);
  v_purchase := public.normalize_pricing_unit(COALESCE(p_purchase_unit, 'ud'));

  IF p_pack_qty IS NULL OR p_pack_qty <= 0
     OR p_pack_unit IS NULL OR trim(p_pack_unit) = '' THEN
    RETURN NULL;
  END IF;

  IF v_from = 'ud' AND v_purchase IN ('g', 'kg', 'ml', 'l', 'cl') THEN
    v_piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, v_purchase);
    IF v_piece IS NOT NULL AND v_piece > 0 THEN
      RETURN p_qty * v_piece;
    END IF;
  END IF;

  IF v_purchase = 'ud' AND v_from IN ('g', 'kg', 'ml', 'l', 'cl') THEN
    v_piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, v_from);
    IF v_piece IS NOT NULL AND v_piece > 0 THEN
      RETURN p_qty / v_piece;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_consumption_qty_to_purchase_unit(
  p_qty numeric,
  p_recipe_unit text,
  p_purchase_unit text,
  p_supplier_pricing_mode text DEFAULT NULL,
  p_pack_unit_size_qty numeric DEFAULT NULL,
  p_pack_unit_size_unit text DEFAULT NULL,
  p_recipe_name text DEFAULT NULL,
  p_ingredient_name text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v numeric;
  v_piece numeric;
  v_from text;
  v_purchase text;
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  v := public.convert_pricing_qty(p_qty, p_recipe_unit, COALESCE(p_purchase_unit, 'ud'));
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  v_from := public.normalize_pricing_unit(p_recipe_unit);
  v_purchase := public.normalize_pricing_unit(COALESCE(p_purchase_unit, 'ud'));

  IF p_pack_unit_size_qty IS NOT NULL
     AND p_pack_unit_size_qty > 0
     AND p_pack_unit_size_unit IS NOT NULL
     AND trim(p_pack_unit_size_unit) <> '' THEN

    IF v_from = 'ud' AND v_purchase IN ('g', 'kg', 'ml', 'l', 'cl') THEN
      v_piece := public.convert_pricing_qty(
        p_pack_unit_size_qty,
        p_pack_unit_size_unit,
        v_purchase
      );
      IF v_piece IS NOT NULL AND v_piece > 0 THEN
        RETURN p_qty * v_piece;
      END IF;
    END IF;

    IF v_purchase = 'ud' AND v_from IN ('g', 'kg', 'ml', 'l', 'cl') THEN
      v_piece := public.convert_pricing_qty(
        p_pack_unit_size_qty,
        p_pack_unit_size_unit,
        v_from
      );
      IF v_piece IS NOT NULL AND v_piece > 0 THEN
        RETURN p_qty / v_piece;
      END IF;
    END IF;
  END IF;

  RAISE EXCEPTION
    'Consumo personal: en "%" el ingrediente "%" no se puede convertir de unidad de receta % a unidad de compra %. Configure una equivalencia física por unidad si procede.',
    COALESCE(NULLIF(trim(p_recipe_name), ''), '(producto)'),
    COALESCE(NULLIF(trim(p_ingredient_name), ''), '(ingrediente)'),
    COALESCE(NULLIF(trim(p_recipe_unit), ''), '?'),
    COALESCE(NULLIF(trim(COALESCE(p_purchase_unit, 'ud')), ''), '?')
    USING HINT = 'Revise recipe_ingredients.unit, ingredients.purchase_unit y la equivalencia física por unidad.';
END;
$$;

-- These functions encoded the retired idea that pack price was an alternate
-- authority for ingredient price. No runtime caller remains.
DROP FUNCTION IF EXISTS public.compute_ingredient_current_price_from_pack(numeric,numeric,numeric,text,text);
DROP FUNCTION IF EXISTS public.pack_price_for_target_current(numeric,numeric,numeric,text,text);
DROP FUNCTION IF EXISTS public.invoice_line_price_to_purchase_unit(numeric,numeric,text,text,numeric);
