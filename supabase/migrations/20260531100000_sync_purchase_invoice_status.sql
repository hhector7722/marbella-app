-- Sincroniza purchase_invoices.status con el estado real de líneas + stock.
-- Cuando todas las líneas están resueltas (mapped|excluded) y el stock PURCHASE
-- está aplicado, la cabecera pasa a 'mapped' (devengo en finanzas).
-- Si se deshace un mapeo o falta stock, vuelve a 'pending_mapping' desde 'mapped'.

CREATE OR REPLACE FUNCTION public.sync_purchase_invoice_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_line_count int;
  v_unresolved int;
  v_stock_missing int;
  v_fully_processed boolean;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status
  FROM public.purchase_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Estado manual/archivo: no tocar
  IF v_status = 'completed' THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_line_count
  FROM public.purchase_invoice_lines
  WHERE invoice_id = p_invoice_id;

  IF v_line_count = 0 THEN
    IF v_status = 'mapped' THEN
      UPDATE public.purchase_invoices
      SET status = 'pending_mapping'
      WHERE id = p_invoice_id;
    END IF;
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_unresolved
  FROM public.purchase_invoice_lines pil
  WHERE pil.invoice_id = p_invoice_id
    AND NOT (
      pil.status = 'excluded'
      OR (
        pil.mapped_ingredient_id IS NOT NULL
        AND COALESCE(pil.status, '') = 'mapped'
      )
    );

  IF v_unresolved > 0 THEN
    IF v_status = 'mapped' THEN
      UPDATE public.purchase_invoices
      SET status = 'pending_mapping'
      WHERE id = p_invoice_id;
    END IF;
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO v_stock_missing
  FROM public.purchase_invoice_lines pil
  WHERE pil.invoice_id = p_invoice_id
    AND COALESCE(pil.status, '') = 'mapped'
    AND pil.mapped_ingredient_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.movement_type = 'PURCHASE'
        AND sm.ingredient_id = pil.mapped_ingredient_id
        AND sm.reference_doc = 'ALB-LINE-' || pil.id::text
    );

  v_fully_processed := v_stock_missing = 0;

  IF v_fully_processed THEN
    IF v_status IS DISTINCT FROM 'mapped' THEN
      UPDATE public.purchase_invoices
      SET status = 'mapped'
      WHERE id = p_invoice_id;
    END IF;
  ELSIF v_status = 'mapped' THEN
    UPDATE public.purchase_invoices
    SET status = 'pending_mapping'
    WHERE id = p_invoice_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_purchase_invoice_status(uuid) IS
  'Alinea purchase_invoices.status con líneas resueltas (mapped|excluded) y stock PURCHASE ALB-LINE-*; respeta completed.';

CREATE OR REPLACE FUNCTION public.trg_sync_purchase_invoice_status_after_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_purchase_invoice_status(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_purchase_invoice_status_after_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line_id uuid;
  v_invoice_id uuid;
  v_suffix text;
BEGIN
  IF NEW.movement_type IS DISTINCT FROM 'PURCHASE' THEN
    RETURN NEW;
  END IF;

  v_suffix := COALESCE(NEW.reference_doc, '');
  IF v_suffix NOT LIKE 'ALB-LINE-%' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_line_id := substring(v_suffix FROM 10)::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NEW;
  END;

  SELECT pil.invoice_id
  INTO v_invoice_id
  FROM public.purchase_invoice_lines pil
  WHERE pil.id = v_line_id;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM public.sync_purchase_invoice_status(v_invoice_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_purchase_invoice_status_on_line ON public.purchase_invoice_lines;
CREATE TRIGGER trigger_sync_purchase_invoice_status_on_line
  AFTER INSERT OR UPDATE OF status, mapped_ingredient_id
  ON public.purchase_invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_purchase_invoice_status_after_line();

DROP TRIGGER IF EXISTS trigger_sync_purchase_invoice_status_on_stock ON public.stock_movements;
CREATE TRIGGER trigger_sync_purchase_invoice_status_on_stock
  AFTER INSERT OR UPDATE OF movement_type, reference_doc, ingredient_id
  ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_purchase_invoice_status_after_stock();

GRANT EXECUTE ON FUNCTION public.sync_purchase_invoice_status(uuid) TO authenticated, service_role;

-- Backfill: recalcular cabeceras existentes (excepto completed)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.purchase_invoices
    WHERE COALESCE(status, '') <> 'completed'
  LOOP
    PERFORM public.sync_purchase_invoice_status(r.id);
  END LOOP;
END;
$$;
