-- K4 · Simplifica el modelo de precio de recepción.
--
-- La presentación del proveedor vive en purchase_mapping_versions. El precio
-- económico persistido en ingredients.current_price es siempre canónico:
-- €/kg, €/l o €/ud según purchase_unit.
--
-- Los campos legacy supplier_pricing_mode/pack_* se conservan temporalmente
-- como metadatos/puente de unidades para consumidores antiguos, pero ya no
-- condicionan ni escriben el precio de una recepción K4.

CREATE OR REPLACE FUNCTION private.apply_receipt_line(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_key text := trim(COALESCE(p_idempotency_key, ''));
  v_now timestamptz := now();
  v_line public.purchase_invoice_lines%ROWTYPE;
  v_invoice public.purchase_invoices%ROWTYPE;
  v_ingredient public.ingredients%ROWTYPE;
  v_mapping public.purchase_mapping_versions%ROWTYPE;
  v_effective_mapping public.purchase_mapping_versions%ROWTYPE;
  v_existing public.purchase_receipt_confirmations%ROWTYPE;
  v_order_item public.purchase_order_items%ROWTYPE;
  v_allocation jsonb;
  v_confirmation_id uuid := gen_random_uuid();
  v_movement_id uuid := gen_random_uuid();
  v_line_unit text;
  v_billing_unit text;
  v_content_unit text;
  v_purchase_unit text;
  v_base_unit text;
  v_expected_base_unit text;
  v_content_in_purchase_unit numeric;
  v_purchase_quantity numeric;
  v_physical_quantity numeric;
  v_observed_price numeric;
  v_normalized_price numeric;
  v_price_before numeric(18,8);
  v_price_after numeric(18,8);
  v_price_changed boolean := false;
  v_mapping_requires_confirmation boolean := false;
  v_allocated_line_quantity numeric := 0;
  v_allocation_order_quantity numeric;
  v_allocation_line_quantity numeric;
  v_already_received_for_order numeric;
  v_effective_allocation_count integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Solo manager o admin puede confirmar una recepción.');
  END IF;

  IF p_invoice_line_id IS NULL OR p_mapping_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Faltan la línea de albarán o la versión de mapeo seleccionada.');
  END IF;
  IF length(v_key) = 0 OR length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La clave de idempotencia es obligatoria y debe tener como máximo 200 caracteres.');
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Las asignaciones a pedidos deben ser una lista, aunque esté vacía.');
  END IF;

  -- Serializa reintentos de la misma intención antes de tomar filas de negocio.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
  SELECT * INTO v_existing
  FROM public.purchase_receipt_confirmations
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.purchase_invoice_line_id = p_invoice_line_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'confirmation_id', v_existing.id,
        'stock_movement_id', v_existing.stock_movement_id,
        'physical_quantity', v_existing.physical_quantity,
        'base_unit', v_existing.base_unit,
        'normalized_unit_price', v_existing.normalized_unit_price,
        'price_changed', v_existing.price_changed,
        'price_locked', v_existing.price_locked
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'La clave de idempotencia ya pertenece a otra recepción.');
  END IF;

  SELECT * INTO v_line
  FROM public.purchase_invoice_lines
  WHERE id = p_invoice_line_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La línea de albarán no existe.');
  END IF;

  SELECT * INTO v_existing
  FROM public.purchase_receipt_confirmations
  WHERE purchase_invoice_line_id = v_line.id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'receipt_already_applied', 'message', 'La línea ya tiene una recepción económica confirmada.');
  END IF;

  SELECT * INTO v_invoice
  FROM public.purchase_invoices
  WHERE id = v_line.invoice_id
  FOR UPDATE;
  IF NOT FOUND OR v_invoice.supplier_id IS NULL OR trim(COALESCE(v_invoice.file_path, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El documento no tiene proveedor o archivo original válido.');
  END IF;
  IF trim(COALESCE(v_line.original_name, '')) = ''
     OR v_line.status IS DISTINCT FROM 'mapped'
     OR v_line.mapped_ingredient_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La línea debe estar revisada, con nombre e ingrediente mapeado.');
  END IF;
  IF v_line.quantity IS NULL OR v_line.quantity <= 0
     OR v_line.unit_price IS NULL OR v_line.unit_price <= 0
     OR trim(COALESCE(v_line.line_unit, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Faltan cantidad física, unidad de línea o precio unitario positivo.');
  END IF;

  SELECT * INTO v_mapping
  FROM public.purchase_mapping_versions
  WHERE id = p_mapping_version_id
  FOR UPDATE;
  IF NOT FOUND OR v_mapping.status = 'rejected'::public.purchase_mapping_version_status
     OR v_mapping.supplier_id <> v_invoice.supplier_id
     OR v_mapping.ingredient_id IS NULL
     OR v_mapping.ingredient_id <> v_line.mapped_ingredient_id
     OR lower(trim(v_mapping.supplier_item_name)) <> lower(trim(v_line.original_name)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La versión de mapeo no es válida para esta línea, proveedor e ingrediente.');
  END IF;

  -- Una propuesta se confirma por copia append-only solo al final, cuando ya
  -- pasaron todas las validaciones. Mientras tanto puede interpretarse para
  -- la previsualización sin dejar un hecho parcial.
  IF v_mapping.status = 'proposed'::public.purchase_mapping_version_status THEN
    SELECT * INTO v_effective_mapping
    FROM public.purchase_mapping_versions
    WHERE supersedes_id = v_mapping.id
      AND status = 'confirmed'::public.purchase_mapping_version_status;
    IF NOT FOUND THEN
      v_effective_mapping := v_mapping;
      v_mapping_requires_confirmation := true;
    END IF;
  ELSE
    v_effective_mapping := v_mapping;
  END IF;

  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = v_effective_mapping.ingredient_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El ingrediente destino ya no existe.');
  END IF;

  v_line_unit := lower(trim(v_line.line_unit));
  v_billing_unit := lower(trim(COALESCE(v_effective_mapping.line_billing_unit, '')));
  v_content_unit := private.k4_normalize_unit(v_effective_mapping.line_content_unit);
  v_purchase_unit := private.k4_normalize_unit(v_ingredient.purchase_unit);
  v_base_unit := private.k4_normalize_unit(v_ingredient.base_unit);
  v_expected_base_unit := private.k4_base_unit_for_purchase_unit(v_purchase_unit);

  IF v_line_unit = '' OR v_billing_unit = '' OR v_line_unit <> v_billing_unit
     OR v_effective_mapping.line_content_qty IS NULL OR v_effective_mapping.line_content_qty <= 0
     OR v_content_unit IS NULL OR v_purchase_unit IS NULL OR v_base_unit IS NULL
     OR v_expected_base_unit IS NULL OR v_base_unit <> v_expected_base_unit THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La presentación no define una conversión física compatible con la unidad base del ingrediente.');
  END IF;

  v_content_in_purchase_unit := private.k4_convert_quantity(
    v_effective_mapping.line_content_qty,
    v_content_unit,
    v_purchase_unit
  );
  IF v_content_in_purchase_unit IS NULL OR v_content_in_purchase_unit <= 0
     OR abs(v_effective_mapping.conversion_factor - v_content_in_purchase_unit) > 0.00000001 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El factor de conversión no coincide con el contenido físico declarado.');
  END IF;

  v_purchase_quantity := v_line.quantity * v_effective_mapping.conversion_factor;
  v_physical_quantity := private.k4_convert_quantity(v_purchase_quantity, v_purchase_unit, v_base_unit);
  v_observed_price := v_line.unit_price;
  v_normalized_price := v_observed_price / v_effective_mapping.conversion_factor;
  IF v_purchase_quantity <= 0 OR v_physical_quantity IS NULL OR v_physical_quantity <= 0
     OR v_normalized_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'No se puede normalizar la cantidad física o el precio de la línea.');
  END IF;

  -- Valida primero la forma y la suma de todas las asignaciones. Una recepción
  -- sin pedido es válida: la lista vacía no genera filas de conciliación.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS a(value)
    WHERE jsonb_typeof(a.value) <> 'object'
       OR COALESCE(a.value->>'purchase_order_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(a.value->'quantity_in_order_unit') <> 'number'
       OR jsonb_typeof(a.value->'quantity_in_invoice_line_unit') <> 'number'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Cada asignación debe indicar una línea de pedido y dos cantidades numéricas positivas.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS a(value)
    GROUP BY a.value->>'purchase_order_item_id'
    HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Una línea de pedido solo puede aparecer una vez por recepción.');
  END IF;

  FOR v_allocation IN
    SELECT a.value
    FROM jsonb_array_elements(p_allocations) AS a(value)
    ORDER BY (a.value->>'purchase_order_item_id')::uuid
  LOOP
    v_allocation_order_quantity := (v_allocation->>'quantity_in_order_unit')::numeric;
    v_allocation_line_quantity := (v_allocation->>'quantity_in_invoice_line_unit')::numeric;
    IF v_allocation_order_quantity <= 0 OR v_allocation_line_quantity <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Las cantidades asignadas deben ser positivas.');
    END IF;
    SELECT * INTO v_order_item
    FROM public.purchase_order_items
    WHERE id = (v_allocation->>'purchase_order_item_id')::uuid
    FOR UPDATE;
    IF NOT FOUND OR v_order_item.ingredient_id <> v_ingredient.id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Una asignación no pertenece al ingrediente de esta recepción.');
    END IF;
    SELECT COALESCE(sum(a.quantity_in_order_unit), 0)
    INTO v_already_received_for_order
    FROM public.purchase_order_item_receipt_allocations a
    WHERE a.purchase_order_item_id = v_order_item.id
      AND a.status = 'confirmed'::public.purchase_receipt_allocation_status
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_order_item_receipt_allocations successor
        WHERE successor.supersedes_id = a.id
          AND successor.status = 'confirmed'::public.purchase_receipt_allocation_status
      );
    IF v_already_received_for_order + v_allocation_order_quantity > v_order_item.quantity + 0.00000001 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La asignación supera la cantidad pendiente de una línea de pedido.');
    END IF;
    v_allocated_line_quantity := v_allocated_line_quantity + v_allocation_line_quantity;
    v_effective_allocation_count := v_effective_allocation_count + 1;
  END LOOP;
  IF v_allocated_line_quantity > v_line.quantity + 0.00000001 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Las asignaciones superan la cantidad recibida en la línea.');
  END IF;

  v_price_before := v_ingredient.current_price;
  v_price_after := CASE WHEN v_ingredient.price_locked THEN v_price_before ELSE v_normalized_price END;
  v_price_changed := NOT v_ingredient.price_locked
    AND abs(v_price_before - v_normalized_price) > 0.00000001;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'preview', true,
      'line_name', v_line.original_name,
      'ingredient_id', v_ingredient.id,
      'ingredient_name', v_ingredient.name,
      'mapping_version_id', v_effective_mapping.id,
      'mapping_will_be_confirmed', v_mapping_requires_confirmation,
      'line_billing_unit', v_effective_mapping.line_billing_unit,
      'line_content_qty', v_effective_mapping.line_content_qty,
      'line_content_unit', v_effective_mapping.line_content_unit,
      'conversion_factor', v_effective_mapping.conversion_factor,
      'physical_quantity', v_physical_quantity,
      'base_unit', v_base_unit,
      'purchase_quantity', v_purchase_quantity,
      'purchase_unit', v_purchase_unit,
      'observed_unit_price', v_observed_price,
      'normalized_unit_price', v_normalized_price,
      'price_before', v_price_before,
      'price_after', v_price_after,
      'price_locked', v_ingredient.price_locked,
      'price_changed', v_price_changed,
      'allocation_count', v_effective_allocation_count
    );
  END IF;

  IF v_mapping_requires_confirmation THEN
    INSERT INTO public.purchase_mapping_versions (
      legacy_mapping_id, supplier_id, supplier_item_name, ingredient_id,
      conversion_factor, line_billing_unit, line_content_qty, line_content_unit,
      status, supersedes_id, source_document_extraction_id, idempotency_key,
      proposed_by, confirmed_by, confirmed_at, note
    ) VALUES (
      v_mapping.legacy_mapping_id, v_mapping.supplier_id, v_mapping.supplier_item_name, v_mapping.ingredient_id,
      v_mapping.conversion_factor, v_mapping.line_billing_unit, v_mapping.line_content_qty, v_mapping.line_content_unit,
      'confirmed'::public.purchase_mapping_version_status, v_mapping.id, v_mapping.source_document_extraction_id,
      'receipt-map:' || v_key, v_mapping.proposed_by, v_actor_id, v_now,
      'Confirmada por apply_receipt_line'
    )
    RETURNING * INTO v_effective_mapping;
  END IF;

  INSERT INTO public.stock_movements (
    id, movement_type, ingredient_id, quantity, unit, unit_price, total_amount,
    movement_date, reference_doc, original_description, processed_by,
    reference_type, reference_id, idempotency_key, origin, actor_profile_id,
    mapping_version_id, source_document_extraction_id, correlation_id, provenance
  ) VALUES (
    v_movement_id, 'PURCHASE', v_ingredient.id, v_physical_quantity, v_base_unit,
    v_normalized_price, v_normalized_price * v_purchase_quantity,
    v_now, 'RECEIPT:' || v_confirmation_id::text, v_line.original_name,
    'apply_receipt_line', 'purchase_invoice_line'::public.stock_reference_type,
    v_line.id, v_key, 'receipt_confirmation'::public.stock_movement_origin,
    v_actor_id, v_effective_mapping.id, v_effective_mapping.source_document_extraction_id,
    v_confirmation_id,
    jsonb_build_object(
      'schema_version', 'k4',
      'receipt_confirmation_id', v_confirmation_id,
      'purchase_invoice_id', v_invoice.id,
      'purchase_invoice_line_id', v_line.id,
      'supplier_id', v_invoice.supplier_id,
      'mapping_version_id', v_effective_mapping.id,
      'observed_unit_price', v_observed_price,
      'normalized_unit_price', v_normalized_price,
      'purchase_unit', v_purchase_unit,
      'purchase_quantity', v_purchase_quantity,
      'base_unit', v_base_unit,
      'physical_quantity', v_physical_quantity
    )
  );

  INSERT INTO public.purchase_receipt_confirmations (
    id, purchase_invoice_line_id, purchase_invoice_id, supplier_id, ingredient_id,
    mapping_version_id, source_document_extraction_id, stock_movement_id,
    actor_profile_id, idempotency_key, physical_quantity, base_unit,
    purchase_quantity, purchase_unit, observed_unit_price, normalized_unit_price,
    price_before, price_after, price_locked, price_changed, confirmed_at, provenance
  ) VALUES (
    v_confirmation_id, v_line.id, v_invoice.id, v_invoice.supplier_id, v_ingredient.id,
    v_effective_mapping.id, v_effective_mapping.source_document_extraction_id, v_movement_id,
    v_actor_id, v_key, v_physical_quantity, v_base_unit,
    v_purchase_quantity, v_purchase_unit, v_observed_price, v_normalized_price,
    v_price_before, v_price_after, v_ingredient.price_locked, v_price_changed, v_now,
    jsonb_build_object(
      'schema_version', 'k4',
      'line_status_at_confirmation', v_line.status,
      'allocation_count', v_effective_allocation_count,
      'source_document_path', v_invoice.file_path
    )
  );

  FOR v_allocation IN
    SELECT a.value
    FROM jsonb_array_elements(p_allocations) AS a(value)
    ORDER BY (a.value->>'purchase_order_item_id')::uuid
  LOOP
    INSERT INTO public.purchase_order_item_receipt_allocations (
      purchase_order_item_id, purchase_invoice_line_id,
      quantity_in_order_unit, quantity_in_invoice_line_unit,
      mapping_version_id, status, idempotency_key,
      proposed_by, confirmed_by, confirmed_at, note
    ) VALUES (
      (v_allocation->>'purchase_order_item_id')::uuid, v_line.id,
      (v_allocation->>'quantity_in_order_unit')::numeric,
      (v_allocation->>'quantity_in_invoice_line_unit')::numeric,
      v_effective_mapping.id, 'confirmed'::public.purchase_receipt_allocation_status,
      'receipt-allocation:' || v_confirmation_id::text || ':' || (v_allocation->>'purchase_order_item_id'),
      v_actor_id, v_actor_id, v_now, 'Confirmada por apply_receipt_line'
    );
  END LOOP;

  IF v_price_changed THEN
    PERFORM set_config('app.receipt_confirmation_price_write', 'on', true);
    UPDATE public.ingredients
    SET current_price = v_normalized_price,
        updated_at = v_now
    WHERE id = v_ingredient.id
    RETURNING current_price INTO v_price_after;

    IF abs(v_price_after - v_normalized_price) > 0.00000001 THEN
      RAISE EXCEPTION 'K4_NEEDS_REVIEW: El modelo de precio no produjo el precio normalizado esperado.';
    END IF;

    INSERT INTO public.ingredient_price_history (
      ingredient_id, old_price, new_price, changed_by, changed_at, source,
      purchase_invoice_id, purchase_invoice_line_id, mapping_version_id,
      receipt_confirmation_id, stock_movement_id, idempotency_key, provenance
    ) VALUES (
      v_ingredient.id, v_price_before, v_price_after, v_actor_id, v_now,
      'receipt_confirmation', v_invoice.id, v_line.id, v_effective_mapping.id,
      v_confirmation_id, v_movement_id, 'receipt-price:' || v_key,
      jsonb_build_object(
        'schema_version', 'k4',
        'observed_unit_price', v_observed_price,
        'normalized_unit_price', v_normalized_price,
        'purchase_unit', v_purchase_unit,
        'price_model', 'canonical_purchase_unit'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'confirmation_id', v_confirmation_id,
    'stock_movement_id', v_movement_id,
    'mapping_version_id', v_effective_mapping.id,
    'physical_quantity', v_physical_quantity,
    'base_unit', v_base_unit,
    'purchase_quantity', v_purchase_quantity,
    'purchase_unit', v_purchase_unit,
    'observed_unit_price', v_observed_price,
    'normalized_unit_price', v_normalized_price,
    'price_before', v_price_before,
    'price_after', v_price_after,
    'price_locked', v_ingredient.price_locked,
    'price_changed', v_price_changed,
    'allocation_count', v_effective_allocation_count
  );
END;
$$;
