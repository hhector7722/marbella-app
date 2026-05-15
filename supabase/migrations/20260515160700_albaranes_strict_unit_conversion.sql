-- 1. Ampliar el esquema para soportar conversión dimensional estricta
ALTER TABLE public.purchase_invoice_lines
  ADD COLUMN IF NOT EXISTS line_unit text;

ALTER TABLE public.supplier_item_mappings
  ADD COLUMN IF NOT EXISTS line_billing_unit text,
  ADD COLUMN IF NOT EXISTS line_content_qty numeric,
  ADD COLUMN IF NOT EXISTS line_content_unit text;

-- 2. Función de normalización robusta (SECURITY DEFINER para uso seguro en triggers)
CREATE OR REPLACE FUNCTION public.invoice_line_price_to_purchase_unit(
  p_unit_price numeric,
  p_mapping_content_qty numeric,
  p_mapping_content_unit text,
  p_ingredient_purchase_unit text,
  p_fallback_factor numeric
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_converted_qty numeric;
BEGIN
  IF p_mapping_content_qty IS NOT NULL AND p_mapping_content_unit IS NOT NULL THEN
    v_converted_qty := public.convert_pricing_qty(p_mapping_content_qty, p_mapping_content_unit, p_ingredient_purchase_unit);
    
    IF v_converted_qty IS NULL OR v_converted_qty = 0 THEN
      RETURN NULL; 
    END IF;
    
    RETURN p_unit_price / v_converted_qty;
  END IF;

  RETURN p_unit_price / COALESCE(NULLIF(p_fallback_factor, 0), 1);
END;
$$;

-- 3. Reescritura del trigger de inserción de línea (Anti-silent-failure integrado)
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
  v_old_price numeric;
  v_new_price numeric;
  v_price_locked boolean;
BEGIN
  SELECT 
    m.ingredient_id, 
    m.conversion_factor,
    m.line_content_qty,
    m.line_content_unit,
    i.purchase_unit,
    i.current_price,
    COALESCE(i.price_locked, false)
  INTO 
    v_ingredient_id, 
    v_conversion_factor,
    v_mapping_content_qty,
    v_mapping_content_unit,
    v_ingredient_purchase_unit,
    v_old_price,
    v_price_locked
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

    IF NOT v_price_locked THEN
      INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
      VALUES (v_ingredient_id, COALESCE(v_old_price, 0), v_new_price, NOW());
      
      UPDATE public.ingredients
      SET current_price = v_new_price,
          updated_at = NOW()
      WHERE id = v_ingredient_id;
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
