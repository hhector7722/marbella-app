-- Precio fijo opcional: si price_locked = true, los albaranes no sobrescriben current_price
-- (trigger handle_new_invoice_line + lógica app en updatePurchaseInvoiceLineAction / confirmarMapeoAction).

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ingredients.price_locked IS
  'Si true, las recepciones por albarán no actualizan current_price ni escriben ingredient_price_history por ese flujo.';

CREATE OR REPLACE FUNCTION public.handle_new_invoice_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  found_ingredient_id uuid;
  v_conversion_factor numeric;
  v_old_price numeric;
  v_new_price numeric;
  v_price_locked boolean;
BEGIN
  SELECT ingredient_id, conversion_factor
  INTO found_ingredient_id, v_conversion_factor
  FROM public.supplier_item_mappings
  WHERE supplier_id = (SELECT supplier_id FROM public.purchase_invoices WHERE id = NEW.invoice_id)
    AND supplier_item_name = NEW.original_name;

  IF found_ingredient_id IS NOT NULL THEN
    v_new_price := NEW.unit_price / COALESCE(NULLIF(v_conversion_factor, 0), 1);

    SELECT current_price, COALESCE(price_locked, false)
    INTO v_old_price, v_price_locked
    FROM public.ingredients
    WHERE id = found_ingredient_id;

    IF NOT COALESCE(v_price_locked, false) THEN
      INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
      VALUES (found_ingredient_id, COALESCE(v_old_price, 0), v_new_price, NOW());

      UPDATE public.ingredients
      SET current_price = v_new_price,
          updated_at = NOW()
      WHERE id = found_ingredient_id;
    END IF;

    UPDATE public.purchase_invoice_lines
    SET mapped_ingredient_id = found_ingredient_id,
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
