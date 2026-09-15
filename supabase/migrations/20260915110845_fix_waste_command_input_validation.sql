-- Corrección P0: el contrato JSON de merma acepta números JSON válidos y
-- conserva la misma semántica append-only/idempotente de la migración anterior.
-- No modifica movimientos existentes.

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

  FOR v_item IN SELECT item FROM jsonb_array_elements(p_items) AS rows(item) LOOP
    v_ordinal := v_ordinal + 1;
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Línea de merma inválida en posición %', v_ordinal;
    END IF;

    BEGIN
      v_ingredient_id := NULLIF(btrim(v_item->>'ingredient_id'), '')::uuid;
      v_quantity := NULLIF(v_item->>'quantity_base', '')::numeric;
      v_unit := btrim(coalesce(v_item->>'unit_base', ''));
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Línea de merma inválida en posición %', v_ordinal;
    END;

    IF v_ingredient_id IS NULL OR v_quantity IS NULL OR v_unit = '' THEN
      RAISE EXCEPTION 'Línea de merma inválida en posición %', v_ordinal;
    END IF;
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
        'schema_version', 'p0-ledger-gate-v1.1'
      )
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted_count', v_inserted, 'idempotent_count', v_idempotent);
END;
$$;

REVOKE ALL ON FUNCTION public.record_waste_movements(jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_waste_movements(jsonb, uuid, text) TO authenticated;
