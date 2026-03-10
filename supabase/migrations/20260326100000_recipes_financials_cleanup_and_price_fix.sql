-- 1) Corregir historial de precios en trigger de albaranes: registrar old_price ANTES de actualizar ingrediente
-- 2) Eliminar código redundante: vista materializada recipe_financials y su trigger (no usada en app)

-- ========== FIX handle_new_invoice_line: historial con old_price correcto ==========
CREATE OR REPLACE FUNCTION public.handle_new_invoice_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    found_ingredient_id UUID;
    v_conversion_factor NUMERIC;
    v_old_price NUMERIC;
    v_new_price NUMERIC;
BEGIN
    SELECT ingredient_id, conversion_factor
    INTO found_ingredient_id, v_conversion_factor
    FROM public.supplier_item_mappings
    WHERE supplier_id = (SELECT supplier_id FROM public.purchase_invoices WHERE id = NEW.invoice_id)
      AND supplier_item_name = NEW.original_name;

    IF found_ingredient_id IS NOT NULL THEN
        v_new_price := NEW.unit_price / COALESCE(NULLIF(v_conversion_factor, 0), 1);

        -- Leer old_price ANTES de cualquier UPDATE
        SELECT current_price INTO v_old_price
        FROM public.ingredients
        WHERE id = found_ingredient_id;

        -- Registrar historial con valores correctos (old vs new)
        INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
        VALUES (found_ingredient_id, COALESCE(v_old_price, 0), v_new_price, NOW());

        -- Actualizar línea del albarán
        UPDATE public.purchase_invoice_lines
        SET mapped_ingredient_id = found_ingredient_id,
            status = 'mapped'
        WHERE id = NEW.id;

        -- Actualizar precio del ingrediente (origen: albarán del proveedor)
        UPDATE public.ingredients
        SET current_price = v_new_price,
            updated_at = NOW()
        WHERE id = found_ingredient_id;

        -- Opcional: actualizar last_known_price en el mapeo
        UPDATE public.supplier_item_mappings
        SET last_known_price = NEW.unit_price
        WHERE supplier_id = (SELECT supplier_id FROM public.purchase_invoices WHERE id = NEW.invoice_id)
          AND supplier_item_name = NEW.original_name;
    END IF;

    RETURN NEW;
END;
$$;

-- ========== ELIMINAR recipe_financials (redundante, no usada en frontend) ==========
DROP TRIGGER IF EXISTS trigger_refresh_financials_on_price_change ON public.ingredients;
DROP FUNCTION IF EXISTS public.refresh_recipe_financials();
DROP MATERIALIZED VIEW IF EXISTS public.recipe_financials;
