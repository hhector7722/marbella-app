-- The quantity on a manual package receipt is already reflected in an
-- adjustment stock movement. Never let invoice editing create an inconsistent
-- duplicate representation. Corrections must use an explicit stock audit flow.
CREATE OR REPLACE FUNCTION public.guard_manual_package_invoice_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE v_linked boolean;
BEGIN
 IF TG_TABLE_NAME='purchase_invoices' THEN
   IF OLD.source<>'manual' THEN RETURN NEW; END IF;
   SELECT EXISTS(
     SELECT 1 FROM public.manual_ice_receipts WHERE invoice_id=OLD.id
     UNION ALL
     SELECT 1 FROM public.manual_vermut_receipts WHERE invoice_id=OLD.id
   ) INTO v_linked;
   IF v_linked AND (
        NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
   ) THEN
     RAISE EXCEPTION 'Entrega física contabilizada: no puedes editar esta cabecera sin una rectificación auditada';
   END IF;
   RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='purchase_invoice_lines' THEN
   SELECT EXISTS(
     SELECT 1 FROM public.manual_ice_receipts WHERE invoice_id=coalesce(NEW.invoice_id,OLD.invoice_id)
     UNION ALL
     SELECT 1 FROM public.manual_vermut_receipts WHERE invoice_id=coalesce(NEW.invoice_id,OLD.invoice_id)
   ) INTO v_linked;
   IF v_linked THEN
     RAISE EXCEPTION 'Línea de entrega de envases ya registrada en stock: requiere rectificación auditada';
   END IF;
   RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_manual_package_invoice_mutation ON public.purchase_invoices;
CREATE TRIGGER guard_manual_package_invoice_mutation
BEFORE UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_manual_package_invoice_mutation();

DROP TRIGGER IF EXISTS guard_manual_package_invoice_line_update ON public.purchase_invoice_lines;
CREATE TRIGGER guard_manual_package_invoice_line_update
BEFORE UPDATE OR DELETE ON public.purchase_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.guard_manual_package_invoice_mutation();
