-- Precondición K5 / cierre P0.
--
-- El saldo canónico nace exclusivamente de public.stock_movements y se lee
-- mediante public.stock_current. ingredients.stock_current sigue existiendo
-- como caché legado durante el corte físico, pero no puede recibir escrituras
-- directas de una persona, Copilot ni un cliente Data API.

CREATE OR REPLACE FUNCTION private.prevent_direct_ingredient_stock_cache_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- La única actualización compatible del caché legado procede del trigger
  -- de proyección disparado al insertar un movimiento. Una UPDATE iniciada
  -- directamente entra con profundidad 1; la actualización anidada del
  -- trigger de stock entra con profundidad 2.
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION
      'STOCK_LEDGER_ONLY: ingredients.stock_current no admite escrituras directas; registre un movimiento explícito.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingredients_stock_current_ledger_only ON public.ingredients;
CREATE TRIGGER ingredients_stock_current_ledger_only
  BEFORE UPDATE OF stock_current ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_direct_ingredient_stock_cache_write();

COMMENT ON TRIGGER ingredients_stock_current_ledger_only ON public.ingredients IS
  'Bloquea ajustes directos del caché legado; solo el trigger derivado de stock_movements puede actualizarlo hasta el corte físico.';

CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
  p_ingredient_id uuid,
  p_quantity_base numeric,
  p_unit text,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id uuid;
  v_movement_id uuid;
  v_expected_unit text;
  v_reference_external_id text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para registrar un ajuste de stock';
  END IF;

  IF p_ingredient_id IS NULL OR p_quantity_base IS NULL OR p_quantity_base = 0 THEN
    RAISE EXCEPTION 'El ingrediente y una cantidad base distinta de cero son obligatorios';
  END IF;

  IF v_reason = '' OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio y debe tener como máximo 500 caracteres';
  END IF;

  IF v_idempotency_key = '' OR length(v_idempotency_key) > 240 THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria y debe tener como máximo 240 caracteres';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('record_stock_adjustment:' || v_idempotency_key, 0));

  SELECT sm.id
  INTO v_existing_id
  FROM public.stock_movements sm
  WHERE sm.idempotency_key = v_idempotency_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('movement_id', v_existing_id, 'idempotent', true);
  END IF;

  SELECT coalesce(nullif(btrim(i.base_unit::text), ''), nullif(btrim(i.unit::text), ''))
  INTO v_expected_unit
  FROM public.ingredients i
  WHERE i.id = p_ingredient_id
  FOR SHARE;

  IF v_expected_unit IS NULL THEN
    RAISE EXCEPTION 'Ingrediente no encontrado o sin unidad base';
  END IF;

  IF btrim(coalesce(p_unit, '')) IS DISTINCT FROM v_expected_unit THEN
    RAISE EXCEPTION 'La unidad del ajuste (%) no coincide con la unidad base del ingrediente (%)', p_unit, v_expected_unit;
  END IF;

  v_reference_external_id := 'manual-adjustment:' || v_idempotency_key;

  INSERT INTO public.stock_movements (
    movement_type,
    ingredient_id,
    quantity,
    unit,
    movement_date,
    reference_doc,
    original_description,
    processed_by,
    reference_type,
    reference_external_id,
    idempotency_key,
    origin,
    actor_profile_id,
    correlation_id,
    provenance
  ) VALUES (
    'ADJUSTMENT',
    p_ingredient_id,
    p_quantity_base,
    v_expected_unit,
    now(),
    v_reference_external_id,
    'Ajuste manual de stock: ' || v_reason,
    auth.uid()::text,
    'manual_adjustment'::public.stock_reference_type,
    v_reference_external_id,
    v_idempotency_key,
    'manager_adjustment'::public.stock_movement_origin,
    auth.uid(),
    gen_random_uuid(),
    jsonb_build_object(
      'source', 'copilot',
      'command', 'record_stock_adjustment',
      'reason', v_reason,
      'schema_version', 'p0-ledger-gate-v1'
    )
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object('movement_id', v_movement_id, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_stock(uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.actualizar_stock(uuid, numeric);

REVOKE ALL ON FUNCTION public.record_stock_adjustment(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_adjustment(uuid, numeric, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.record_stock_adjustment(uuid, numeric, text, text, text) IS
  'Comando explícito e idempotente de ajuste en unidad base. Inserta un ADJUSTMENT append-only; nunca escribe ingredients.stock_current directamente.';

-- Las inserciones de stock no se exponen por la Data API. Los flujos que ya
-- existían siguen vivos, pero pasan por comandos estrechos: TPV y consumo de
-- personal son funciones de servidor; merma y recuento se materializan abajo.
DROP POLICY IF EXISTS k1_p_stock_insert ON public.stock_movements;
DROP POLICY IF EXISTS k1_r2_stock_insert_purchase_manager ON public.stock_movements;
DROP POLICY IF EXISTS k1_r_stock_insert_manager_admin ON public.stock_movements;
DROP POLICY IF EXISTS k4_stock_purchase_only_via_receipt_command ON public.stock_movements;
REVOKE INSERT ON TABLE public.stock_movements FROM authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_inventory_count_movements(
  p_items jsonb,
  p_correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_ordinal integer := 0;
  v_ingredient_id uuid;
  v_quantity numeric;
  v_unit text;
  v_expected_unit text;
  v_physical_stock numeric;
  v_theoretical_stock numeric;
  v_key text;
  v_existing_id uuid;
  v_inserted integer := 0;
  v_idempotent integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para certificar un recuento de stock';
  END IF;
  IF p_correlation_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El recuento requiere una correlación y al menos una línea';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('record_inventory_count:' || p_correlation_id::text, 0));

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS rows(value) LOOP
    v_ordinal := v_ordinal + 1;
    IF jsonb_typeof(v_item) <> 'object'
       OR coalesce(v_item->>'ingredient_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(v_item->'quantity_base') <> 'number'
       OR coalesce(btrim(v_item->>'unit_base'), '') = '' THEN
      RAISE EXCEPTION 'Línea de recuento inválida en posición %', v_ordinal;
    END IF;

    v_ingredient_id := (v_item->>'ingredient_id')::uuid;
    v_quantity := (v_item->>'quantity_base')::numeric;
    v_unit := btrim(v_item->>'unit_base');
    v_physical_stock := NULLIF(v_item->>'physical_stock', '')::numeric;
    v_theoretical_stock := NULLIF(v_item->>'theoretical_stock', '')::numeric;
    IF v_quantity = 0 THEN
      RAISE EXCEPTION 'La línea de recuento % no puede tener delta cero', v_ordinal;
    END IF;

    SELECT coalesce(nullif(btrim(i.base_unit::text), ''), nullif(btrim(i.unit::text), ''))
    INTO v_expected_unit
    FROM public.ingredients i
    WHERE i.id = v_ingredient_id
    FOR SHARE;
    IF v_expected_unit IS NULL OR v_unit IS DISTINCT FROM v_expected_unit THEN
      RAISE EXCEPTION 'La unidad de recuento (%) no coincide con la unidad base del ingrediente (%)', v_unit, v_expected_unit;
    END IF;

    v_key := 'inventory-count:' || p_correlation_id::text || ':' || v_ordinal::text;
    SELECT id INTO v_existing_id FROM public.stock_movements WHERE idempotency_key = v_key;
    IF v_existing_id IS NOT NULL THEN
      v_idempotent := v_idempotent + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.stock_movements (
      movement_type, ingredient_id, quantity, unit, movement_date,
      reference_doc, original_description, processed_by,
      reference_type, reference_external_id, idempotency_key, origin,
      actor_profile_id, correlation_id, provenance
    ) VALUES (
      'INVENTORY_COUNT', v_ingredient_id, v_quantity, v_expected_unit, now(),
      'INV-' || p_correlation_id::text || '-' || v_ingredient_id::text,
      'Recuento físico (' || coalesce(v_physical_stock::text, '?') || ' ' || v_expected_unit || ')',
      'record_inventory_count_movements',
      'inventory_count'::public.stock_reference_type,
      'INV-' || p_correlation_id::text || '-' || v_ingredient_id::text,
      v_key, 'inventory_count'::public.stock_movement_origin,
      auth.uid(), p_correlation_id,
      jsonb_build_object(
        'source', 'dashboard_inventory',
        'command', 'record_inventory_count_movements',
        'physical_stock', v_physical_stock,
        'theoretical_stock', v_theoretical_stock,
        'schema_version', 'p0-ledger-gate-v1'
      )
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted_count', v_inserted, 'idempotent_count', v_idempotent);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_waste_movements(
  p_items jsonb,
  p_correlation_id uuid,
  p_source text DEFAULT 'dashboard_waste'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_ordinal integer := 0;
  v_ingredient_id uuid;
  v_quantity numeric;
  v_unit text;
  v_expected_unit text;
  v_description text;
  v_source text := btrim(coalesce(p_source, ''));
  v_key text;
  v_existing_id uuid;
  v_inserted integer := 0;
  v_idempotent integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para registrar merma';
  END IF;
  IF p_correlation_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR v_source = '' OR length(v_source) > 120 THEN
    RAISE EXCEPTION 'La merma requiere una correlación, un origen y al menos una línea';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('record_waste:' || p_correlation_id::text, 0));

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS rows(value) LOOP
    v_ordinal := v_ordinal + 1;
    IF jsonb_typeof(v_item) <> 'object'
       OR coalesce(v_item->>'ingredient_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(v_item->'quantity_base') <> 'number'
       OR coalesce(btrim(v_item->>'unit_base'), '') = '' THEN
      RAISE EXCEPTION 'Línea de merma inválida en posición %', v_ordinal;
    END IF;

    v_ingredient_id := (v_item->>'ingredient_id')::uuid;
    v_quantity := (v_item->>'quantity_base')::numeric;
    v_unit := btrim(v_item->>'unit_base');
    v_description := left(coalesce(nullif(btrim(v_item->>'description'), ''), 'Merma manual (ingredientes)'), 500);
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad de merma debe ser positiva en posición %', v_ordinal;
    END IF;

    SELECT coalesce(nullif(btrim(i.base_unit::text), ''), nullif(btrim(i.unit::text), ''))
    INTO v_expected_unit
    FROM public.ingredients i
    WHERE i.id = v_ingredient_id
    FOR SHARE;
    IF v_expected_unit IS NULL OR v_unit IS DISTINCT FROM v_expected_unit THEN
      RAISE EXCEPTION 'La unidad de merma (%) no coincide con la unidad base del ingrediente (%)', v_unit, v_expected_unit;
    END IF;

    v_key := 'waste:' || p_correlation_id::text || ':' || v_ordinal::text;
    SELECT id INTO v_existing_id FROM public.stock_movements WHERE idempotency_key = v_key;
    IF v_existing_id IS NOT NULL THEN
      v_idempotent := v_idempotent + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.stock_movements (
      movement_type, ingredient_id, quantity, unit, movement_date,
      reference_doc, original_description, processed_by,
      reference_type, reference_external_id, idempotency_key, origin,
      actor_profile_id, correlation_id, provenance
    ) VALUES (
      'WASTE', v_ingredient_id, v_quantity, v_expected_unit, now(),
      'WASTE-' || p_correlation_id::text || '-' || v_ordinal::text,
      v_description, 'record_waste_movements',
      'waste_entry'::public.stock_reference_type,
      'WASTE-' || p_correlation_id::text || '-' || v_ordinal::text,
      v_key, 'manager_adjustment'::public.stock_movement_origin,
      auth.uid(), p_correlation_id,
      jsonb_build_object(
        'source', v_source,
        'command', 'record_waste_movements',
        'schema_version', 'p0-ledger-gate-v1'
      )
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted_count', v_inserted, 'idempotent_count', v_idempotent);
END;
$$;

-- El webhook TPV conserva su contrato, pero ya no necesita un grant de INSERT
-- sobre el ledger: se ejecuta como comando de servidor estrecho.
CREATE OR REPLACE FUNCTION public.process_ticket_stock_deduction(p_numero_documento text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF btrim(coalesce(p_numero_documento, '')) = '' THEN
    RAISE EXCEPTION 'El número de ticket es obligatorio';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ticket-stock:' || p_numero_documento, 0));
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-' || p_numero_documento AND movement_type = 'SALE'
  ) THEN RETURN; END IF;

  INSERT INTO public.stock_movements (
    movement_type, ingredient_id, quantity, unit, movement_date,
    reference_doc, original_description, processed_by,
    reference_type, reference_external_id, idempotency_key, origin, provenance
  )
  SELECT
    'SALE', ri.ingredient_id,
    public.recipe_qty_to_base_unit(
      tl.unidades * mtr.factor_porcion * ri.quantity_gross * ri.umb_multiplier,
      ri.unit, i.base_unit, i.supplier_pricing_mode, i.pack_unit_size_qty, i.pack_unit_size_unit
    ),
    i.base_unit, now(), 'TICKET-' || p_numero_documento,
    'Deducción automática TPV - Artículo TPV ID: ' || tl.articulo_id::text,
    'process_ticket_stock_deduction',
    'sale_ticket'::public.stock_reference_type, p_numero_documento,
    'sale:' || p_numero_documento || ':' || ri.ingredient_id::text,
    'sale_webhook'::public.stock_movement_origin,
    jsonb_build_object('source', 'bdp_webhook', 'command', 'process_ticket_stock_deduction', 'schema_version', 'p0-ledger-gate-v1')
  FROM public.ticket_lines_marbella tl
  JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
  JOIN public.recipe_ingredients ri ON mtr.recipe_id = ri.recipe_id
  JOIN public.ingredients i ON ri.ingredient_id = i.id
  WHERE tl.numero_documento = p_numero_documento
    AND public.recipe_qty_to_base_unit(
      tl.unidades * mtr.factor_porcion * ri.quantity_gross * ri.umb_multiplier,
      ri.unit, i.base_unit, i.supplier_pricing_mode, i.pack_unit_size_qty, i.pack_unit_size_unit
    ) IS NOT NULL
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_ticket_stock_deduction(p_numero_documento text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF btrim(coalesce(p_numero_documento, '')) = '' THEN
    RAISE EXCEPTION 'El número de ticket es obligatorio';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ticket-refund:' || p_numero_documento, 0));
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'REFUND-' || p_numero_documento AND movement_type = 'ADJUSTMENT'
  ) THEN RETURN; END IF;

  INSERT INTO public.stock_movements (
    movement_type, ingredient_id, quantity, unit, movement_date,
    reference_doc, original_description, processed_by,
    reference_type, reference_external_id, idempotency_key, origin, provenance
  )
  SELECT
    'ADJUSTMENT', ingredient_id, abs(quantity), unit, now(),
    'REFUND-' || p_numero_documento,
    'Reintegro automático por anulación de TPV - Ticket Original: ' || p_numero_documento,
    'revert_ticket_stock_deduction',
    'sale_ticket'::public.stock_reference_type, 'REFUND-' || p_numero_documento,
    'sale-refund:' || p_numero_documento || ':' || ingredient_id::text,
    'reversal'::public.stock_movement_origin,
    jsonb_build_object('source', 'bdp_webhook', 'command', 'revert_ticket_stock_deduction', 'schema_version', 'p0-ledger-gate-v1')
  FROM public.stock_movements
  WHERE reference_doc = 'TICKET-' || p_numero_documento AND movement_type = 'SALE'
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_count_movements(jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_waste_movements(jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_inventory_count_movements(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_waste_movements(jsonb, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.process_ticket_stock_deduction(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_ticket_stock_deduction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ticket_stock_deduction(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_ticket_stock_deduction(text) TO service_role;
