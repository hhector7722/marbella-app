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


-- Physical equivalence is independent from supplier pricing.
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS physical_unit_qty numeric,
  ADD COLUMN IF NOT EXISTS physical_unit_unit text;

UPDATE public.ingredients
SET physical_unit_qty = pack_unit_size_qty,
    physical_unit_unit = public.normalize_pricing_unit(pack_unit_size_unit)
WHERE physical_unit_qty IS NULL
  AND physical_unit_unit IS NULL
  AND pack_unit_size_qty IS NOT NULL
  AND pack_unit_size_qty > 0
  AND pack_unit_size_unit IS NOT NULL
  AND trim(pack_unit_size_unit) <> '';

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingredients_physical_unit_qty_positive'
      AND conrelid = 'public.ingredients'::regclass
  ) THEN
    ALTER TABLE public.ingredients
      ADD CONSTRAINT ingredients_physical_unit_qty_positive
      CHECK (physical_unit_qty IS NULL OR physical_unit_qty > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingredients_physical_unit_unit_valid'
      AND conrelid = 'public.ingredients'::regclass
  ) THEN
    ALTER TABLE public.ingredients
      ADD CONSTRAINT ingredients_physical_unit_unit_valid
      CHECK (
        physical_unit_unit IS NULL
        OR physical_unit_unit IN ('g','kg','ml','l','cl','ud')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingredients_physical_unit_pair'
      AND conrelid = 'public.ingredients'::regclass
  ) THEN
    ALTER TABLE public.ingredients
      ADD CONSTRAINT ingredients_physical_unit_pair
      CHECK (
        (physical_unit_qty IS NULL AND physical_unit_unit IS NULL)
        OR (physical_unit_qty IS NOT NULL AND physical_unit_unit IS NOT NULL)
      );
  END IF;
END;
$;

COMMENT ON COLUMN public.ingredients.physical_unit_qty IS
  'Equivalencia física opcional de 1 unidad contable del ingrediente. Ej. 0.75 con unit=l.';
COMMENT ON COLUMN public.ingredients.physical_unit_unit IS
  'Unidad de physical_unit_qty. No participa en la fuente del precio; solo en conversiones físicas.';

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


CREATE OR REPLACE FUNCTION public.recipe_qty_to_base_unit(
  p_qty numeric,
  p_recipe_unit text,
  p_base_unit text,
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
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  v := public.convert_pricing_qty(p_qty, p_recipe_unit, p_base_unit);
  IF v IS NOT NULL THEN
    RETURN v;
  END IF;

  IF public.normalize_pricing_unit(p_recipe_unit) = 'ud'
     AND public.normalize_pricing_unit(p_base_unit) IN ('ml','g')
     AND p_pack_qty IS NOT NULL
     AND p_pack_qty > 0
     AND p_pack_unit IS NOT NULL
     AND trim(p_pack_unit) <> '' THEN
    v_piece := public.convert_pricing_qty(p_pack_qty, p_pack_unit, p_base_unit);
    IF v_piece IS NOT NULL AND v_piece > 0 THEN
      RETURN p_qty * v_piece;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recipe_cost(
  p_recipe_id uuid,
  p_use_half_ration boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  total numeric;
  lines_agg jsonb;
BEGIN
  WITH costed AS (
    SELECT
      ri.id AS line_id,
      i.name AS ingredient_name,
      public.fn_recipe_line_cost(
        ri.quantity_gross::numeric,
        COALESCE(ri.quantity_half, 0)::numeric,
        ri.unit::text,
        i.purchase_unit::text,
        i.current_price::numeric,
        p_use_half_ration,
        NULL::text,
        i.physical_unit_qty,
        i.physical_unit_unit
      ) AS line_cost
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = p_recipe_id
  )
  SELECT
    COALESCE(sum(line_cost), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'line_id', line_id,
          'ingredient_name', ingredient_name,
          'line_cost', round(line_cost::numeric, 2)
        )
      ),
      '[]'::jsonb
    )
  INTO total, lines_agg
  FROM costed;

  RETURN jsonb_build_object(
    'total_cost', round(total::numeric, 2),
    'lines', lines_agg
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_consumption_recipe_serving_cost(p_recipe_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(
      public.staff_consumption_movement_amount_eur(
        public.staff_consumption_qty_to_purchase_unit(
          ri.quantity_gross * ri.umb_multiplier,
          ri.unit,
          COALESCE(ing.purchase_unit, 'ud'),
          NULL::text,
          ing.physical_unit_qty,
          ing.physical_unit_unit,
          r.name,
          ing.name
        ),
        COALESCE(ing.purchase_unit, 'ud'),
        ing.purchase_unit,
        ing.current_price
      )
    ),
    0
  )::numeric
  FROM public.recipe_ingredients ri
  JOIN public.ingredients ing ON ing.id = ri.ingredient_id
  JOIN public.recipes r ON r.id = ri.recipe_id
  WHERE ri.recipe_id = p_recipe_id;
$$;

CREATE OR REPLACE FUNCTION public.process_staff_consumption(
  p_employee_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref text := 'STAFF-' || p_employee_id::text || '-' || EXTRACT(EPOCH FROM now())::text;
  v_food_count integer := 0;
  v_stock_written integer := 0;
  v_error_count integer := 0;
  cart_rec RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_employee_id THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_CART', 'stock_written_count', 0, 'error_count', 0);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_food_count
  FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
  JOIN public.recipes r ON r.id = cart.recipe_id
  WHERE NOT public.is_drink_consumption_recipe(r.name, r.category);

  IF v_food_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_FOOD', 'stock_written_count', 0, 'error_count', 0);
  END IF;

  FOR cart_rec IN
    SELECT
      cart.recipe_id,
      LEAST(GREATEST(1, cart.quantity), 20) AS quantity,
      cart.is_half,
      r.name AS recipe_name,
      r.category AS recipe_category
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    BEGIN
      INSERT INTO public.stock_movements (
        movement_type, ingredient_id, quantity, unit, movement_date,
        reference_doc, original_description, processed_by
      )
      SELECT
        'WASTE'::text,
        ri.ingredient_id,
        public.staff_consumption_qty_to_purchase_unit(
          ((CASE
            WHEN cart_rec.is_half AND COALESCE(ri.quantity_half, 0) > 0 THEN ri.quantity_half
            ELSE ri.quantity_gross * (CASE WHEN cart_rec.is_half THEN 0.5 ELSE 1.0 END)
          END) * cart_rec.quantity * ri.umb_multiplier)::numeric,
          ri.unit::text,
          COALESCE(ing.purchase_unit, 'ud')::text,
          NULL::text,
          ing.physical_unit_qty,
          ing.physical_unit_unit,
          cart_rec.recipe_name::text,
          ing.name::text
        ),
        COALESCE(ing.purchase_unit, 'ud'),
        now(),
        v_ref,
        'Consumo Personal: ' || cart_rec.recipe_name,
        'Auto-Registro Salida (Staff ID: ' || p_employee_id::text || ')'
      FROM public.recipe_ingredients ri
      JOIN public.ingredients ing ON ri.ingredient_id = ing.id
      WHERE ri.recipe_id = cart_rec.recipe_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Receta "%" sin ingredientes en escandallo', cart_rec.recipe_name;
      END IF;

      v_stock_written := v_stock_written + 1;
    EXCEPTION
      WHEN OTHERS THEN
        INSERT INTO public.staff_consumption_register_errors (
          employee_id, reference_doc, recipe_id, recipe_name,
          quantity, is_half, is_drink, error_message
        ) VALUES (
          p_employee_id, v_ref, cart_rec.recipe_id, cart_rec.recipe_name,
          cart_rec.quantity, cart_rec.is_half,
          public.is_drink_consumption_recipe(cart_rec.recipe_name, cart_rec.recipe_category),
          SQLERRM
        );
        v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'reference_doc', v_ref,
    'stock_written_count', v_stock_written,
    'error_count', v_error_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_staff_consumption(p_items jsonb)
RETURNS TABLE(recipe_id uuid, recipe_name text, error_message text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  cart_rec RECORD;
  ing_rec RECORD;
  v_failed uuid[] := '{}';
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  FOR cart_rec IN
    SELECT cart.recipe_id, cart.quantity, cart.is_half, r.name AS recipe_name
    FROM jsonb_to_recordset(p_items) AS cart(recipe_id uuid, quantity numeric, is_half boolean)
    JOIN public.recipes r ON r.id = cart.recipe_id
  LOOP
    IF cart_rec.recipe_id = ANY (v_failed) THEN
      CONTINUE;
    END IF;

    BEGIN
      FOR ing_rec IN
        SELECT
          ri.unit AS recipe_unit,
          ri.quantity_gross,
          ri.quantity_half,
          ri.umb_multiplier,
          COALESCE(ing.purchase_unit, 'ud') AS purchase_unit,
          ing.physical_unit_qty,
          ing.physical_unit_unit,
          ing.name AS ingredient_name
        FROM public.recipe_ingredients ri
        JOIN public.ingredients ing ON ri.ingredient_id = ing.id
        WHERE ri.recipe_id = cart_rec.recipe_id
      LOOP
        PERFORM public.staff_consumption_qty_to_purchase_unit(
          (CASE
            WHEN cart_rec.is_half AND COALESCE(ing_rec.quantity_half, 0) > 0 THEN ing_rec.quantity_half
            ELSE ing_rec.quantity_gross * (CASE WHEN cart_rec.is_half THEN 0.5 ELSE 1.0 END)
          END) * cart_rec.quantity * ing_rec.umb_multiplier,
          ing_rec.recipe_unit,
          ing_rec.purchase_unit,
          NULL::text,
          ing_rec.physical_unit_qty,
          ing_rec.physical_unit_unit,
          cart_rec.recipe_name,
          ing_rec.ingredient_name
        );
      END LOOP;
    EXCEPTION
      WHEN OTHERS THEN
        recipe_id := cart_rec.recipe_id;
        recipe_name := cart_rec.recipe_name;
        error_message := SQLERRM;
        RETURN NEXT;
        v_failed := array_append(v_failed, cart_rec.recipe_id);
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_ticket_stock_deduction(p_numero_documento text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF btrim(COALESCE(p_numero_documento, '')) = '' THEN
    RAISE EXCEPTION 'El número de ticket es obligatorio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ticket-stock:' || p_numero_documento, 0));

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE reference_doc = 'TICKET-' || p_numero_documento
      AND movement_type = 'SALE'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.stock_movements (
    movement_type, ingredient_id, quantity, unit, movement_date,
    reference_doc, original_description, processed_by,
    reference_type, reference_external_id, idempotency_key, origin, provenance
  )
  SELECT
    'SALE',
    ri.ingredient_id,
    public.recipe_qty_to_base_unit(
      tl.unidades * mtr.factor_porcion * ri.quantity_gross * ri.umb_multiplier,
      ri.unit,
      i.base_unit,
      NULL::text,
      i.physical_unit_qty,
      i.physical_unit_unit
    ),
    i.base_unit,
    now(),
    'TICKET-' || p_numero_documento,
    'Deducción automática TPV - Artículo TPV ID: ' || tl.articulo_id::text,
    'process_ticket_stock_deduction',
    'sale_ticket'::public.stock_reference_type,
    p_numero_documento,
    'sale:' || p_numero_documento || ':' || ri.ingredient_id::text,
    'sale_webhook'::public.stock_movement_origin,
    jsonb_build_object(
      'source', 'bdp_webhook',
      'command', 'process_ticket_stock_deduction',
      'schema_version', 'p0-ledger-gate-v1'
    )
  FROM public.ticket_lines_marbella tl
  JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
  JOIN public.recipe_ingredients ri ON mtr.recipe_id = ri.recipe_id
  JOIN public.ingredients i ON ri.ingredient_id = i.id
  WHERE tl.numero_documento = p_numero_documento
    AND public.recipe_qty_to_base_unit(
      tl.unidades * mtr.factor_porcion * ri.quantity_gross * ri.umb_multiplier,
      ri.unit,
      i.base_unit,
      NULL::text,
      i.physical_unit_qty,
      i.physical_unit_unit
    ) IS NOT NULL
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
END;
$$;
