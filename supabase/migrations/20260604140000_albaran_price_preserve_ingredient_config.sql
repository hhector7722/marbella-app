-- Albaranes: al insertar línea mapeada, solo actualizar precio si cambia (no tocar unidades ni pack_*).

CREATE OR REPLACE FUNCTION public.ingredient_prices_are_equal(a numeric, b numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    a IS NOT DISTINCT FROM b
    OR (
      a IS NOT NULL
      AND b IS NOT NULL
      AND abs(a - b) <= 1e-5 * greatest(abs(a), abs(b), 1::numeric)
    );
$$;

CREATE OR REPLACE FUNCTION public.pack_price_for_target_current(
  p_target_current numeric,
  p_pack_units numeric,
  p_pack_unit_size_qty numeric,
  p_pack_unit_size_unit text,
  p_purchase_unit text
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_converted numeric;
  v_denom numeric;
BEGIN
  IF p_target_current IS NULL OR p_target_current < 0 THEN
    RETURN NULL;
  END IF;
  IF p_pack_units IS NULL OR p_pack_units <= 0 THEN
    RETURN NULL;
  END IF;
  IF p_pack_unit_size_qty IS NULL OR p_pack_unit_size_qty <= 0 OR p_pack_unit_size_unit IS NULL THEN
    RETURN NULL;
  END IF;

  v_converted := public.convert_pricing_qty(
    p_pack_unit_size_qty,
    p_pack_unit_size_unit,
    public.normalize_pricing_unit(p_purchase_unit)
  );
  IF v_converted IS NULL OR v_converted <= 0 THEN
    RETURN NULL;
  END IF;

  v_denom := p_pack_units * v_converted;
  IF v_denom <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN p_target_current * v_denom;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_invoice_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ingredient_id uuid;
  v_conversion_factor numeric;
  v_mapping_content_qty numeric;
  v_mapping_content_unit text;
  v_ingredient_purchase_unit text;
  v_supplier_pricing_mode text;
  v_pack_price numeric;
  v_pack_units numeric;
  v_pack_unit_size_qty numeric;
  v_pack_unit_size_unit text;
  v_old_price numeric;
  v_new_price numeric;
  v_price_locked boolean;
  v_next_pack_price numeric;
BEGIN
  SELECT
    m.ingredient_id,
    m.conversion_factor,
    m.line_content_qty,
    m.line_content_unit,
    i.purchase_unit,
    i.current_price,
    COALESCE(i.price_locked, false),
    COALESCE(i.supplier_pricing_mode, 'per_purchase_unit'),
    i.pack_price,
    i.pack_units,
    i.pack_unit_size_qty,
    i.pack_unit_size_unit
  INTO
    v_ingredient_id,
    v_conversion_factor,
    v_mapping_content_qty,
    v_mapping_content_unit,
    v_ingredient_purchase_unit,
    v_old_price,
    v_price_locked,
    v_supplier_pricing_mode,
    v_pack_price,
    v_pack_units,
    v_pack_unit_size_qty,
    v_pack_unit_size_unit
  FROM public.supplier_item_mappings m
  JOIN public.ingredients i ON i.id = m.ingredient_id
  WHERE m.supplier_id = (SELECT supplier_id FROM public.purchase_invoices WHERE id = NEW.invoice_id)
    AND m.supplier_item_name = NEW.original_name;

  IF v_ingredient_id IS NOT NULL THEN
    v_new_price := public.invoice_line_price_to_purchase_unit(
      NEW.unit_price,
      v_mapping_content_qty,
      v_mapping_content_unit,
      v_ingredient_purchase_unit,
      v_conversion_factor
    );

    IF v_new_price IS NULL THEN
      RAISE EXCEPTION 'Descuadre dimensional crítico en albarán. No se puede convertir el artículo "%" (unidad proveedor: %) a la unidad base de receta (%)',
        NEW.original_name, v_mapping_content_unit, v_ingredient_purchase_unit;
    END IF;

    IF NOT COALESCE(v_price_locked, false)
       AND NOT public.ingredient_prices_are_equal(COALESCE(v_old_price, 0), v_new_price) THEN
      IF v_supplier_pricing_mode = 'per_pack' THEN
        v_next_pack_price := public.pack_price_for_target_current(
          v_new_price,
          v_pack_units,
          v_pack_unit_size_qty,
          v_pack_unit_size_unit,
          v_ingredient_purchase_unit
        );
        IF v_next_pack_price IS NOT NULL
           AND NOT public.ingredient_prices_are_equal(COALESCE(v_pack_price, 0), v_next_pack_price) THEN
          INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
          VALUES (v_ingredient_id, COALESCE(v_old_price, 0), v_new_price, NOW());

          UPDATE public.ingredients
          SET pack_price = v_next_pack_price,
              updated_at = NOW()
          WHERE id = v_ingredient_id;
        ELSIF v_next_pack_price IS NULL
              AND NOT public.ingredient_prices_are_equal(COALESCE(v_old_price, 0), v_new_price) THEN
          INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
          VALUES (v_ingredient_id, COALESCE(v_old_price, 0), v_new_price, NOW());

          UPDATE public.ingredients
          SET current_price = v_new_price,
              updated_at = NOW()
          WHERE id = v_ingredient_id;
        END IF;
      ELSE
        INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
        VALUES (v_ingredient_id, COALESCE(v_old_price, 0), v_new_price, NOW());

        UPDATE public.ingredients
        SET current_price = v_new_price,
            updated_at = NOW()
        WHERE id = v_ingredient_id;
      END IF;
    END IF;

    UPDATE public.purchase_invoice_lines
    SET mapped_ingredient_id = v_ingredient_id,
        status = 'mapped'
    WHERE id = NEW.id;

    UPDATE public.supplier_item_mappings
    SET last_known_price = NEW.unit_price
    WHERE supplier_id = (SELECT supplier_id FROM public.purchase_invoices WHERE id = NEW.invoice_id)
      AND supplier_item_name = NEW.original_name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_invoice_line() IS
  'Auto-mapeo y precio al insertar línea: solo actualiza current_price o pack_price si el valor cambia; no modifica purchase_unit, recipe_unit ni pack_units.';
