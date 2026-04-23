-- Albaranes: auto-entrada de stock cuando una línea queda mapeada
-- Objetivo: al pasar una línea a status='mapped' y tener mapped_ingredient_id,
-- insertar (una sola vez) un movimiento PURCHASE en stock_movements.

CREATE OR REPLACE FUNCTION public.handle_invoice_line_mapped_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier_id bigint;
  v_factor numeric;
  v_unit text;
  v_qty numeric;
  v_ref text;
BEGIN
  -- Solo cuando la línea queda mapeada (transición a mapped)
  IF NEW.mapped_ingredient_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') <> 'mapped' THEN
    RETURN NEW;
  END IF;

  IF OLD.mapped_ingredient_id IS NOT NULL AND COALESCE(OLD.status, '') = 'mapped' THEN
    -- Ya estaba mapeada, no reinsertar
    RETURN NEW;
  END IF;

  -- Requiere proveedor en la cabecera para poder usar supplier_item_mappings
  SELECT supplier_id INTO v_supplier_id
  FROM public.purchase_invoices
  WHERE id = NEW.invoice_id;

  IF v_supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Factor de conversión desde el mapeo (debe existir para ser seguro)
  SELECT conversion_factor
  INTO v_factor
  FROM public.supplier_item_mappings
  WHERE supplier_id = v_supplier_id
    AND supplier_item_name = NEW.original_name
    AND ingredient_id = NEW.mapped_ingredient_id
  LIMIT 1;

  IF v_factor IS NULL OR v_factor = 0 THEN
    RETURN NEW;
  END IF;

  SELECT unit INTO v_unit
  FROM public.ingredients
  WHERE id = NEW.mapped_ingredient_id;

  v_qty := COALESCE(NEW.quantity, 0) * v_factor;
  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  v_ref := 'ALB-LINE-' || NEW.id::text;

  -- Idempotencia: una sola entrada por (ref + ingrediente + tipo)
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.movement_type = 'PURCHASE'
      AND sm.ingredient_id = NEW.mapped_ingredient_id
      AND sm.reference_doc = v_ref
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.stock_movements (
    movement_type,
    ingredient_id,
    quantity,
    unit,
    movement_date,
    reference_doc,
    original_description,
    processed_by
  ) VALUES (
    'PURCHASE',
    NEW.mapped_ingredient_id,
    v_qty,
    COALESCE(v_unit, 'ud'),
    now(),
    v_ref,
    'Recepción (auto): ' || COALESCE(NEW.original_name, ''),
    'Auto-Albaranes'
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trigger_invoice_line_mapped_stock'
      AND n.nspname = 'public'
      AND c.relname = 'purchase_invoice_lines'
  ) THEN
    CREATE TRIGGER trigger_invoice_line_mapped_stock
    AFTER UPDATE OF mapped_ingredient_id, status ON public.purchase_invoice_lines
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_invoice_line_mapped_stock();
  END IF;
END $$;

